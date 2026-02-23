import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { Address, FhevmInstanceConfig, ZKProofLike } from "../relayer/relayer-sdk.types";
import type {
  CreateDelegatedEIP712ResponseData,
  CreateEIP712ResponseData,
  DelegatedUserDecryptResponseData,
  EncryptResponseData,
  GenerateKeypairResponseData,
  GetPublicKeyResponseData,
  GetPublicParamsResponseData,
  InitResponseData,
  PublicDecryptResponseData,
  RequestZKProofVerificationResponseData,
  UserDecryptResponseData,
  GenericLogger,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";

export interface NodeWorkerClientConfig {
  fhevmConfig: FhevmInstanceConfig;
  /** Optional logger for tracing worker request lifecycle. */
  logger?: GenericLogger;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  startTime: number;
  type: WorkerRequestType;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const INIT_TIMEOUT_MS = 60_000;

/**
 * Client for communicating with the RelayerSDK Node.js worker thread.
 * Provides a promise-based API for FHE operations using node:worker_threads.
 */
export class NodeWorkerClient {
  #worker: Worker | null = null;
  #config: NodeWorkerClientConfig;
  #pendingRequests = new Map<string, PendingRequest<unknown>>();
  #initPromise: Promise<Worker> | null = null;
  #logger: GenericLogger | undefined;

  constructor(config: NodeWorkerClientConfig) {
    this.#config = config;
    this.#logger = config.logger;
  }

  /**
   * Initialize the worker thread.
   * Deduplicates concurrent calls to prevent worker leaks.
   */
  async initWorker(): Promise<Worker> {
    if (this.#worker) return this.#worker;

    if (!this.#initPromise) {
      this.#initPromise = this.#doInitWorker().catch((err) => {
        this.#initPromise = null;
        throw err;
      });
    }
    return this.#initPromise;
  }

  async #doInitWorker(): Promise<Worker> {
    const worker = new Worker(new URL("./relayer-sdk.node-worker.js", import.meta.url));

    worker.on("message", this.#handleMessage.bind(this));
    worker.on("error", this.#handleError.bind(this));
    worker.on("messageerror", this.#handleMessageError.bind(this));

    try {
      await this.#sendRequestTo<InitResponseData>(
        worker,
        "NODE_INIT",
        { fhevmConfig: this.#config.fhevmConfig },
        INIT_TIMEOUT_MS,
      );
      worker.unref();
      this.#worker = worker;
    } catch (err) {
      worker.terminate();
      throw err;
    }

    return this.#worker;
  }

  terminate(): void {
    if (this.#worker) {
      for (const [id, pending] of this.#pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Worker terminated"));
        this.#pendingRequests.delete(id);
      }

      this.#worker.terminate();
      this.#worker = null;
    }
    this.#initPromise = null;
  }

  async generateKeypair(): Promise<GenerateKeypairResponseData> {
    return this.#sendRequest<GenerateKeypairResponseData>("GENERATE_KEYPAIR", {});
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number,
  ): Promise<CreateEIP712ResponseData> {
    return this.#sendRequest<CreateEIP712ResponseData>("CREATE_EIP712", {
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });
  }

  async encrypt(
    values: bigint[],
    contractAddress: Address,
    userAddress: Address,
  ): Promise<EncryptResponseData> {
    return this.#sendRequest<EncryptResponseData>("ENCRYPT", {
      values,
      contractAddress,
      userAddress,
    });
  }

  async userDecrypt(
    handles: string[],
    contractAddress: Address,
    signedContractAddresses: Address[],
    privateKey: string,
    publicKey: string,
    signature: string,
    signerAddress: Address,
    startTimestamp: number,
    durationDays: number,
  ): Promise<UserDecryptResponseData> {
    return this.#sendRequest<UserDecryptResponseData>("USER_DECRYPT", {
      handles,
      contractAddress,
      signedContractAddresses,
      privateKey,
      publicKey,
      signature,
      signerAddress,
      startTimestamp,
      durationDays,
    });
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResponseData> {
    return this.#sendRequest<PublicDecryptResponseData>("PUBLIC_DECRYPT", {
      handles,
    });
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number,
  ): Promise<CreateDelegatedEIP712ResponseData> {
    return this.#sendRequest<CreateDelegatedEIP712ResponseData>("CREATE_DELEGATED_EIP712", {
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    });
  }

  async delegatedUserDecrypt(
    handles: string[],
    contractAddress: Address,
    signedContractAddresses: Address[],
    privateKey: string,
    publicKey: string,
    signature: string,
    delegatorAddress: Address,
    delegateAddress: Address,
    startTimestamp: number,
    durationDays: number,
  ): Promise<DelegatedUserDecryptResponseData> {
    return this.#sendRequest<DelegatedUserDecryptResponseData>("DELEGATED_USER_DECRYPT", {
      handles,
      contractAddress,
      signedContractAddresses,
      privateKey,
      publicKey,
      signature,
      delegatorAddress,
      delegateAddress,
      startTimestamp,
      durationDays,
    });
  }

  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.#sendRequest<RequestZKProofVerificationResponseData>(
      "REQUEST_ZK_PROOF_VERIFICATION",
      { zkProof },
    );
  }

  async getPublicKey(): Promise<GetPublicKeyResponseData> {
    return this.#sendRequest<GetPublicKeyResponseData>("GET_PUBLIC_KEY", {});
  }

  async getPublicParams(bits: number): Promise<GetPublicParamsResponseData> {
    return this.#sendRequest<GetPublicParamsResponseData>("GET_PUBLIC_PARAMS", {
      bits,
    });
  }

  #sendRequestTo<T>(
    worker: Worker,
    type: WorkerRequestType,
    payload: WorkerRequest["payload"],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID();
      const startTime = performance.now();
      this.#logger?.debug(`[NodeWorkerClient] → ${type}`, { id });

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        const elapsed = Math.round(performance.now() - startTime);
        this.#logger?.error(`[NodeWorkerClient] ${type} timed out after ${timeoutMs}ms`, {
          id,
          elapsed,
        });
        reject(new Error(`Request ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.#pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        startTime,
        type,
      });

      const request = { id, type, payload } as WorkerRequest;
      worker.postMessage(request);
    });
  }

  async #sendRequest<T>(
    type: WorkerRequestType,
    payload: WorkerRequest["payload"],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const worker = await this.initWorker();
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID();
      const startTime = performance.now();
      this.#logger?.debug(`[NodeWorkerClient] → ${type}`, { id });

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        const elapsed = Math.round(performance.now() - startTime);
        this.#logger?.error(`[NodeWorkerClient] ${type} timed out after ${timeoutMs}ms`, {
          id,
          elapsed,
        });
        reject(new Error(`Request ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.#pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
        startTime,
        type,
      });

      const request = { id, type, payload } as WorkerRequest;
      worker.postMessage(request);
    });
  }

  #handleMessage(response: WorkerResponse<unknown>): void {
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      this.#logger?.warn("[NodeWorkerClient] Received response for unknown request", {
        id: response.id,
      });
      return;
    }

    const elapsed = Math.round(performance.now() - pending.startTime);

    clearTimeout(pending.timeoutId);
    this.#pendingRequests.delete(response.id);

    if (response.success) {
      this.#logger?.debug(`[NodeWorkerClient] ← ${pending.type} OK`, {
        id: response.id,
        elapsed,
      });
      pending.resolve(response.data);
    } else {
      this.#logger?.error(`[NodeWorkerClient] ← ${pending.type} FAILED`, {
        id: response.id,
        elapsed,
        error: response.error,
      });
      pending.reject(new Error(response.error));
    }
  }

  #handleError(error: Error): void {
    this.#logger?.error("[NodeWorkerClient] Worker error", { error: error.message });
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending(`Worker error: ${error.message}`);
    worker?.terminate();
  }

  #handleMessageError(): void {
    this.#logger?.error("[NodeWorkerClient] Message deserialization failed");
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending("Worker message deserialization failed");
    worker?.terminate();
  }

  #rejectAllPending(message: string): void {
    for (const [id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.#pendingRequests.delete(id);
    }
  }
}
