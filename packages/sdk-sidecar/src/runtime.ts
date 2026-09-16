import { RemoteStorage, type StorageStream } from "./remote-storage.js";
import { randomUUID } from "node:crypto";
import { status } from "@grpc/grpc-js";
import type { Address, ZamaSDK } from "@zama-fhe/sdk";
import type {
  CreateContextRequest,
  Operation,
  UpdateAccountRequest,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { walletAccount } from "./encoding.js";
import { credentialLockKeys, type Coordinate } from "./coordination.js";
import { cancelled, invalidArgument, SidecarError } from "./errors.js";
import { operationContext, RemoteSigner, type SignerStream } from "./remote-signer.js";

export type ContextSdk = Pick<ZamaSDK, "decryption" | "permits" | "offline" | "dispose">;
export type ContextFactory = (
  request: CreateContextRequest,
  signer: RemoteSigner | undefined,
  storage: RemoteStorage,
) => Promise<{ sdk: ContextSdk; credentialScope?: string; storageIdentities: string[] }>;
type ActiveOperation = { controller: AbortController; done: Promise<unknown> };
type Context = {
  sdk: ContextSdk;
  credentialScope?: string;
  storageIdentities: string[];
  storage: RemoteStorage;
  signer: RemoteSigner | undefined;
  operations: Map<string, ActiveOperation>;
  updating: boolean;
};
export class SidecarRuntime {
  #contexts = new Map<string, Context>();
  #creations = new Set<Promise<void>>();
  #retirements = new Set<Promise<void>>();
  #closing = false;
  constructor(
    private readonly factory: ContextFactory,
    private readonly coordinate: Coordinate,
    private readonly limits: { maxContexts?: number; maxOperationsPerContext?: number } = {},
  ) {}
  async createContext(request: CreateContextRequest): Promise<string> {
    if (this.#closing) {
      throw cancelled();
    }
    if (
      this.limits.maxContexts !== undefined &&
      this.#contexts.size + this.#creations.size >= this.limits.maxContexts
    ) {
      throw new SidecarError("CONTEXT_LIMIT", status.RESOURCE_EXHAUSTED, "Too many SDK contexts.");
    }
    if (request.account && !request.signerEnabled) {
      throw invalidArgument("An account requires an enabled signer.");
    }
    const id = randomUUID();
    const signer = request.signerEnabled
      ? new RemoteSigner(walletAccount(request.account), (operationIds) =>
          this.#cancelOperations(id, operationIds),
        )
      : undefined;
    const storage = new RemoteStorage();
    const creation = Promise.withResolvers<void>();
    this.#creations.add(creation.promise);
    try {
      const created = await this.factory(request, signer, storage);
      if (this.#closing) {
        storage.dispose();
        created.sdk.dispose();
        signer?.dispose();
        throw cancelled();
      }
      this.#contexts.set(id, {
        ...created,
        signer,
        storage,
        operations: new Map(),
        updating: false,
      });
      return id;
    } catch (error) {
      storage.dispose();
      signer?.dispose();
      throw error;
    } finally {
      this.#creations.delete(creation.promise);
      creation.resolve();
    }
  }
  #get(id: string): Context {
    const context = this.#contexts.get(id);
    if (!context) {
      throw new SidecarError("CONTEXT_NOT_FOUND", status.NOT_FOUND, "SDK context does not exist.");
    }
    return context;
  }
  #cancelOperations(id: string, operationIds?: readonly string[]): void {
    const context = this.#contexts.get(id);
    for (const [operationId, operation] of context?.operations.entries() ?? []) {
      if (operationIds === undefined || operationIds.includes(operationId)) {
        operation.controller.abort();
      }
    }
  }
  attachSigner(id: string, stream: SignerStream): RemoteSigner {
    const signer = this.#get(id).signer;
    if (!signer) {
      throw invalidArgument("SDK context has no signer adapter.");
    }
    signer.attach(stream);
    return signer;
  }
  attachStorage(id: string, stream: StorageStream): RemoteStorage {
    const storage = this.#get(id).storage;
    storage.attach(stream);
    return storage;
  }
  async updateAccount(request: UpdateAccountRequest, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw cancelled();
    }
    const context = this.#get(request.contextId);
    const signer = context.signer;
    if (!signer) {
      throw invalidArgument("SDK context has no signer adapter.");
    }
    if (context.updating) {
      throw new SidecarError(
        "ACCOUNT_CHANGING",
        status.FAILED_PRECONDITION,
        "Account update is already in progress.",
      );
    }
    const next = walletAccount(request.account);
    const previous = signer.walletAccount.getSnapshot();
    if (previous?.address === next?.address && previous?.chainId === next?.chainId) {
      signer.walletAccount.setSnapshot(next);
      return;
    }
    context.updating = true;
    try {
      this.#cancelOperations(request.contextId);
      await Promise.allSettled([...context.operations.values()].map((operation) => operation.done));
      if (signal?.aborted) {
        throw cancelled();
      }
      this.#get(request.contextId).signer?.walletAccount.setSnapshot(next);
    } finally {
      context.updating = false;
    }
  }
  #admit(reference: Operation): Context {
    const context = this.#get(reference.contextId);
    if (context.updating) {
      throw new SidecarError(
        "ACCOUNT_CHANGING",
        status.FAILED_PRECONDITION,
        "Account update is in progress.",
      );
    }
    if (context.operations.has(reference.operationId)) {
      throw new SidecarError(
        "OPERATION_EXISTS",
        status.ALREADY_EXISTS,
        "Operation ID is already active.",
      );
    }
    if (
      this.limits.maxOperationsPerContext !== undefined &&
      context.operations.size >= this.limits.maxOperationsPerContext
    ) {
      throw new SidecarError(
        "OPERATION_LIMIT",
        status.RESOURCE_EXHAUSTED,
        "Too many active operations.",
      );
    }
    return context;
  }
  async execute<T>(
    reference: Operation | undefined,
    signal: AbortSignal,
    action: (sdk: ContextSdk, signal: AbortSignal) => Promise<T>,
    options: { public?: boolean; credentialSigner?: Address } = {},
  ): Promise<T> {
    if (!reference?.operationId) {
      throw invalidArgument("Operation ID is required.");
    }
    const context = this.#admit(reference);
    if (signal.aborted) {
      throw cancelled();
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const credentialSigner =
      options.credentialSigner ?? context.signer?.walletAccount.getSnapshot()?.address;
    const storageKeys = credentialLockKeys(
      context.storageIdentities,
      credentialSigner,
      context.credentialScope,
    );
    const execute = async () => {
      if (controller.signal.aborted) {
        throw cancelled();
      }
      return operationContext.run({ id: reference.operationId, signal: controller.signal }, () =>
        action(context.sdk, controller.signal),
      );
    };
    const done = Promise.resolve().then(() =>
      options.public ? execute() : this.coordinate(storageKeys, controller.signal, execute),
    );
    context.operations.set(reference.operationId, { controller, done });
    const abortResult = Promise.withResolvers<never>();
    const rejectCancelled = () => abortResult.reject(cancelled());
    controller.signal.addEventListener("abort", rejectCancelled, { once: true });
    void done
      .finally(() => {
        context.operations.delete(reference.operationId);
        signal.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", rejectCancelled);
      })
      .catch(() => {});
    return Promise.race([done, abortResult.promise]);
  }
  async closeContext(id: string): Promise<void> {
    const context = this.#get(id);
    const retirement = Promise.withResolvers<void>();
    this.#retirements.add(retirement.promise);
    try {
      this.#cancelOperations(id);
      this.#contexts.delete(id);
      context.signer?.dispose();
      context.storage.dispose();
      await Promise.allSettled([...context.operations.values()].map((operation) => operation.done));
      context.sdk.dispose();
    } finally {
      this.#retirements.delete(retirement.promise);
      retirement.resolve();
    }
  }
  async waitUntilIdle(): Promise<void> {
    await Promise.allSettled(
      [...this.#contexts.values()].flatMap((context) =>
        [...context.operations.values()].map((operation) => operation.done),
      ),
    );
  }
  async close(): Promise<void> {
    this.#closing = true;
    await Promise.allSettled(this.#creations);
    await Promise.allSettled([...this.#contexts.keys()].map((id) => this.closeContext(id)));
    await Promise.allSettled(this.#retirements);
  }
}
