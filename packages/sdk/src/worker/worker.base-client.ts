import type { ZKProofLike } from "../relayer/relayer-sdk.types";
import type {
  CreateDelegatedEIP712Payload,
  CreateDelegatedEIP712ResponseData,
  CreateEIP712Payload,
  CreateEIP712ResponseData,
  DelegatedUserDecryptPayload,
  DelegatedUserDecryptResponseData,
  EncryptPayload,
  EncryptResponseData,
  GenerateKeypairResponseData,
  GetPublicKeyResponseData,
  GetPublicParamsResponseData,
  InitResponseData,
  PublicDecryptResponseData,
  RequestZKProofVerificationResponseData,
  UserDecryptPayload,
  UserDecryptResponseData,
  GenericLogger,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";

/** Pending request tracker */
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  startTime: number;
  type: WorkerRequestType;
}

/** Default timeout for operations (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Extended timeout for WASM initialization (60 seconds) */
export const INIT_TIMEOUT_MS = 60_000;

/**
 * Abstract base class for worker clients (browser Web Worker and Node.js worker_threads).
 * Encapsulates all shared logic: pending request tracking, timeouts, init dedup, domain methods.
 * Subclasses implement the abstract hooks for platform-specific worker creation and messaging.
 */
export abstract class BaseWorkerClient<TWorker, TConfig> {
  #worker: TWorker | null = null;
  #pendingRequests = new Map<string, PendingRequest<unknown>>();
  #initPromise: Promise<TWorker> | null = null;
  protected readonly config: TConfig;
  protected readonly logger: GenericLogger | undefined;

  constructor(config: TConfig, logger: GenericLogger | undefined) {
    this.config = config;
    this.logger = logger;
  }

  // ===========================================================================
  // Abstract hooks — subclasses must implement
  // ===========================================================================

  /** Create the platform-specific worker instance. */
  protected abstract createWorker(): TWorker;

  /** Wire message/error/messageerror events on the worker. */
  protected abstract wireEvents(worker: TWorker): void;

  /** Post a message to the worker. */
  protected abstract postMessage(worker: TWorker, request: WorkerRequest): void;

  /** Terminate the platform-specific worker. */
  protected abstract terminateWorker(worker: TWorker): void;

  /** Generate a unique request ID. */
  protected abstract generateRequestId(): string;

  /** Return the init request type and payload. */
  protected abstract getInitPayload(): {
    type: WorkerRequestType;
    payload: WorkerRequest["payload"];
  };

  /** Optional hook called after worker init succeeds (e.g. for node worker.unref()). */
  protected onWorkerReady?(_worker: TWorker): void;

  // ===========================================================================
  // Shared init / terminate
  // ===========================================================================

  async initWorker(): Promise<TWorker> {
    if (this.#worker) return this.#worker;

    if (!this.#initPromise) {
      this.#initPromise = this.#doInitWorker().catch((err) => {
        this.#initPromise = null;
        throw err;
      });
    }
    return this.#initPromise;
  }

  async #doInitWorker(): Promise<TWorker> {
    const worker = this.createWorker();
    this.wireEvents(worker);

    try {
      const { type, payload } = this.getInitPayload();
      await this.sendRequestTo<InitResponseData>(worker, type, payload, INIT_TIMEOUT_MS);
      this.onWorkerReady?.(worker);
      this.#worker = worker;
    } catch (err) {
      this.terminateWorker(worker);
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

      this.terminateWorker(this.#worker);
      this.#worker = null;
    }
    this.#initPromise = null;
  }

  // ===========================================================================
  // Message handling (called by subclass event wiring)
  // ===========================================================================

  protected handleResponse(response: WorkerResponse<unknown>): void {
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      this.logger?.warn("[WorkerClient] Received response for unknown request", {
        id: response.id,
      });
      return;
    }

    const elapsed = Math.round(performance.now() - pending.startTime);

    clearTimeout(pending.timeoutId);
    this.#pendingRequests.delete(response.id);

    if (response.success) {
      this.logger?.debug(`[WorkerClient] ← ${pending.type} OK`, {
        id: response.id,
        elapsed,
      });
      pending.resolve(response.data);
    } else {
      this.logger?.error(`[WorkerClient] ← ${pending.type} FAILED`, {
        id: response.id,
        elapsed,
        error: response.error,
      });
      const err = new Error(response.error);
      if ("statusCode" in response && typeof response.statusCode === "number") {
        (err as Error & { statusCode?: number }).statusCode = response.statusCode;
      }
      pending.reject(err);
    }
  }

  protected handleWorkerError(message: string): void {
    this.logger?.error("[WorkerClient] Worker error", { error: message });
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending(`Worker error: ${message}`);
    if (worker) this.terminateWorker(worker);
  }

  protected handleWorkerMessageError(): void {
    this.logger?.error("[WorkerClient] Message deserialization failed");
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending("Worker message deserialization failed");
    if (worker) this.terminateWorker(worker);
  }

  // ===========================================================================
  // Request sending
  // ===========================================================================

  protected sendRequestTo<T>(
    worker: TWorker,
    type: WorkerRequestType,
    payload: WorkerRequest["payload"],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.generateRequestId();
      const startTime = performance.now();
      this.logger?.debug(`[WorkerClient] → ${type}`, { id });

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        const elapsed = Math.round(performance.now() - startTime);
        this.logger?.error(`[WorkerClient] ${type} timed out after ${timeoutMs}ms`, {
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
      this.postMessage(worker, request);
    });
  }

  protected async sendRequest<T>(
    type: WorkerRequestType,
    payload: WorkerRequest["payload"],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const worker = await this.initWorker();
    return this.sendRequestTo<T>(worker, type, payload, timeoutMs);
  }

  // ===========================================================================
  // Domain methods
  // ===========================================================================

  async generateKeypair(): Promise<GenerateKeypairResponseData> {
    return this.sendRequest<GenerateKeypairResponseData>("GENERATE_KEYPAIR", {});
  }

  async createEIP712(params: CreateEIP712Payload): Promise<CreateEIP712ResponseData> {
    return this.sendRequest<CreateEIP712ResponseData>("CREATE_EIP712", params);
  }

  async encrypt(params: EncryptPayload): Promise<EncryptResponseData> {
    return this.sendRequest<EncryptResponseData>("ENCRYPT", params);
  }

  async userDecrypt(params: UserDecryptPayload): Promise<UserDecryptResponseData> {
    return this.sendRequest<UserDecryptResponseData>("USER_DECRYPT", params);
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResponseData> {
    return this.sendRequest<PublicDecryptResponseData>("PUBLIC_DECRYPT", { handles });
  }

  async createDelegatedUserDecryptEIP712(
    params: CreateDelegatedEIP712Payload,
  ): Promise<CreateDelegatedEIP712ResponseData> {
    return this.sendRequest<CreateDelegatedEIP712ResponseData>("CREATE_DELEGATED_EIP712", params);
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptPayload,
  ): Promise<DelegatedUserDecryptResponseData> {
    return this.sendRequest<DelegatedUserDecryptResponseData>("DELEGATED_USER_DECRYPT", params);
  }

  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.sendRequest<RequestZKProofVerificationResponseData>(
      "REQUEST_ZK_PROOF_VERIFICATION",
      { zkProof },
    );
  }

  async getPublicKey(): Promise<GetPublicKeyResponseData> {
    return this.sendRequest<GetPublicKeyResponseData>("GET_PUBLIC_KEY", {});
  }

  async getPublicParams(bits: number): Promise<GetPublicParamsResponseData> {
    return this.sendRequest<GetPublicParamsResponseData>("GET_PUBLIC_PARAMS", { bits });
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  #rejectAllPending(message: string): void {
    for (const [id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.#pendingRequests.delete(id);
    }
  }
}
