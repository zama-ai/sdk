import type {
  CreateDelegatedEIP712Payload,
  CreateDelegatedEIP712ResponseData,
  CreateEIP712Payload,
  CreateEIP712ResponseData,
  DelegatedUserDecryptPayload,
  DelegatedUserDecryptResponseData,
  EncryptPayload,
  EncryptResponseData,
  GenerateKeypairRequest,
  GenerateKeypairResponseData,
  GetPublicKeyRequest,
  GetPublicKeyResponseData,
  GetPublicParamsRequest,
  GetPublicParamsResponseData,
  InitResponseData,
  PublicDecryptPayload,
  PublicDecryptResponseData,
  RequestZKProofVerificationRequest,
  RequestZKProofVerificationResponseData,
  GenericLogger,
  UserDecryptPayload,
  UserDecryptResponseData,
  WorkerEnv,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";
import { deserializeError } from "../utils/error";
import { WorkerRecycledError, WorkerTimeoutError } from "../errors/timeout";

/**
 * Timeout / recovery knobs shared by every worker client (node + web), so the
 * base class can read them generically off `config`.
 */
export interface WorkerClientTimeoutConfig {
  /** Per-operation timeout in **seconds**. Defaults to 30. */
  operationTimeout?: number;
  /** WASM-init timeout in **seconds**. Defaults to 60. */
  initTimeout?: number;
  /**
   * Recycle (terminate + lazily re-init) the worker after an operation timeout,
   * so a hung thread can't keep serving requests. Defaults to `true`.
   */
  recycleWorkerOnTimeout?: boolean;
  /** Diagnostic label surfaced on {@link WorkerTimeoutError} (e.g. `node-worker-2`). */
  workerLabel?: string;
}

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
export abstract class BaseWorkerClient<TWorker, TConfig extends WorkerClientTimeoutConfig> {
  #worker: TWorker | null = null;
  #pendingRequests = new Map<string, PendingRequest<unknown>>();
  #initPromise: Promise<TWorker> | null = null;
  protected readonly config: TConfig;
  protected readonly logger: GenericLogger;

  constructor(config: TConfig, logger: GenericLogger) {
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

  /** Subclasses set "web" or "node" — stamps the env discriminant on INIT payloads. */
  protected abstract readonly env: WorkerEnv;

  /** Optional hook called after worker init succeeds (e.g. for node worker.unref()). */
  protected onWorkerReady?(_worker: TWorker): void;

  // ===========================================================================
  // Shared init / terminate
  // ===========================================================================

  async initWorker(): Promise<TWorker> {
    if (this.#worker) {
      return this.#worker;
    }

    if (!this.#initPromise) {
      this.#initPromise = this.#doInitWorker().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  async #doInitWorker(): Promise<TWorker> {
    const worker = this.createWorker();
    this.wireEvents(worker);

    try {
      const { type, payload } = this.getInitPayload();
      await this.sendRequestTo<InitResponseData>(
        worker,
        type,
        payload,
        this.config.initTimeout !== undefined ? this.config.initTimeout * 1000 : INIT_TIMEOUT_MS,
      );
      this.onWorkerReady?.(worker);
      this.#worker = worker;
    } catch (error) {
      this.terminateWorker(worker);
      throw error;
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
  // Message handling
  // ===========================================================================

  protected handleResponse(response: WorkerResponse<unknown>): void {
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      this.logger.warn("[WorkerClient] Received response for unknown request", { id: response.id });
      return;
    }

    const elapsed = Math.round(performance.now() - pending.startTime);

    clearTimeout(pending.timeoutId);
    this.#pendingRequests.delete(response.id);

    if (response.success) {
      this.logger.debug(`[WorkerClient] ← ${pending.type} OK`, { id: response.id, elapsed });
      pending.resolve(response.data);
    } else {
      // A failed worker response is a handled operation failure: it is
      // propagated to the caller via `pending.reject(err)` below. Logging it at
      // `error` would duplicate a handled failure into the consumer's
      // monitoring (the regression Dfns hit), so it stays at `debug`.
      this.logger.debug(`[WorkerClient] ← ${pending.type} FAILED`, {
        id: response.id,
        elapsed,
        error: response.error,
      });
      // Rebuild the error (and its cause chain) from the structured-clone-safe
      // envelope the worker serialized. Classification happens once on the main
      // thread (`wrapDecryptError`) — the worker stays taxonomy-agnostic.
      const err = response.serialized
        ? deserializeError(response.serialized)
        : new Error(response.error);
      pending.reject(err);
    }
  }

  protected handleWorkerError(message: string): void {
    this.logger.error("[WorkerClient] Worker error", { error: message });
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending(`Worker error: ${message}`);
    if (worker) {
      this.terminateWorker(worker);
    }
  }

  protected handleWorkerMessageError(): void {
    this.logger.error("[WorkerClient] Message deserialization failed");
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending("Worker message deserialization failed");
    if (worker) {
      this.terminateWorker(worker);
    }
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
      this.logger.debug(`[WorkerClient] → ${type}`, { id });

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        const elapsed = Math.round(performance.now() - startTime);
        // A timeout is surfaced via the rejected promise below, so it is a
        // handled failure and stays at `debug` rather than `error`.
        this.logger.debug(`[WorkerClient] ${type} timed out after ${timeoutMs}ms`, { id, elapsed });
        reject(
          new WorkerTimeoutError({
            operation: type,
            timeout: timeoutMs / 1000,
            elapsed: elapsed / 1000,
            worker: this.config.workerLabel,
          }),
        );
        // Self-heal: the worker is presumed stuck, so recycle it (terminate +
        // lazy re-init) — otherwise the hung thread keeps attracting work (the
        // pool's least-connections sees it idle once this request settles).
        if (this.config.recycleWorkerOnTimeout !== false) {
          this.#recycleStuckWorker();
        }
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
    timeoutMs?: number,
  ): Promise<T> {
    const worker = await this.initWorker();
    return this.sendRequestTo<T>(
      worker,
      type,
      payload,
      timeoutMs ??
        (this.config.operationTimeout !== undefined
          ? this.config.operationTimeout * 1000
          : DEFAULT_TIMEOUT_MS),
    );
  }

  /**
   * Terminate the (presumed-stuck) active worker after a timeout and reject any
   * other in-flight requests on it, so the next call lazily re-inits a fresh
   * worker. Mirrors {@link handleWorkerError}'s crash-recovery shape.
   */
  #recycleStuckWorker(): void {
    const worker = this.#worker;
    if (!worker) {
      return;
    }
    this.#worker = null;
    this.#initPromise = null;
    // The sibling requests still in flight did not time out — they are aborted
    // collateral of recycling the worker. Reject them with a typed, retryable
    // `WorkerRecycledError` (not their own `WorkerTimeoutError`, since they never
    // exceeded a bound) so consumers can retry them instead of receiving a
    // terminal `DecryptionFailedError` — the fate of a bare `Error` through
    // `wrapDecryptError`. Only the operation that actually exceeded its bound
    // gets a `WorkerTimeoutError`.
    for (const [id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(
        new WorkerRecycledError({ operation: pending.type, worker: this.config.workerLabel }),
      );
      this.#pendingRequests.delete(id);
    }
    this.logger.warn("[WorkerClient] recycled worker after a timeout", {
      worker: this.config.workerLabel,
    });
    this.terminateWorker(worker);
  }

  // ===========================================================================
  // Domain methods
  // ===========================================================================

  async generateKeypair(
    params: GenerateKeypairRequest["payload"],
  ): Promise<GenerateKeypairResponseData> {
    return this.sendRequest<GenerateKeypairResponseData>("GENERATE_KEYPAIR", params);
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

  async publicDecrypt(params: PublicDecryptPayload): Promise<PublicDecryptResponseData> {
    return this.sendRequest<PublicDecryptResponseData>("PUBLIC_DECRYPT", params);
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
    params: RequestZKProofVerificationRequest["payload"],
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.sendRequest<RequestZKProofVerificationResponseData>(
      "REQUEST_ZK_PROOF_VERIFICATION",
      params,
    );
  }

  async getPublicKey(params: GetPublicKeyRequest["payload"]): Promise<GetPublicKeyResponseData> {
    return this.sendRequest<GetPublicKeyResponseData>("GET_PUBLIC_KEY", params);
  }

  async getPublicParams(
    params: GetPublicParamsRequest["payload"],
  ): Promise<GetPublicParamsResponseData> {
    return this.sendRequest<GetPublicParamsResponseData>("GET_PUBLIC_PARAMS", params);
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
