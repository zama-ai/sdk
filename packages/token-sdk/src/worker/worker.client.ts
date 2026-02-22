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
  UpdateCsrfResponseData,
  UserDecryptResponseData,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "./worker.types";

/** Configuration for the worker client */
export interface WorkerClientConfig {
  cdnUrl: string;
  fhevmConfig: FhevmInstanceConfig;
  csrfToken: string;
}

/** Pending request tracker */
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Default timeout for operations (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Extended timeout for WASM initialization (60 seconds) */
const INIT_TIMEOUT_MS = 60_000;

/**
 * Client for communicating with the RelayerSDK Web Worker.
 * Provides a promise-based API for FHE operations.
 */
export class RelayerWorkerClient {
  #worker: Worker | null = null;
  #config: WorkerClientConfig;
  #pendingRequests = new Map<string, PendingRequest<unknown>>();

  constructor(config: WorkerClientConfig) {
    this.#config = config;
  }

  /**
   * Initialize the worker and SDK.
   * Must be called before any other operations.
   */
  async initWorker(): Promise<Worker> {
    if (!this.#worker) {
      const worker = new Worker(new URL("./relayer-sdk.worker.js", import.meta.url));

      worker.onmessage = this.#handleMessage.bind(this);
      worker.onerror = this.#handleError.bind(this);
      worker.onmessageerror = this.#handleMessageError.bind(this);

      try {
        await this.#sendRequestTo<InitResponseData>(worker, "INIT", this.#config, INIT_TIMEOUT_MS);
        this.#worker = worker;
      } catch (err) {
        worker.terminate();
        throw err;
      }
    }

    return this.#worker;
  }

  /**
   * Terminate the worker and clean up resources.
   */
  terminate(): void {
    if (this.#worker) {
      // Reject all pending requests
      for (const [id, pending] of this.#pendingRequests) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error("Worker terminated"));
        this.#pendingRequests.delete(id);
      }

      this.#worker.terminate();
      this.#worker = null;
    }
  }

  /**
   * Update the CSRF token in the worker.
   * Call this before making authenticated requests to ensure the token is fresh.
   */
  async updateCsrf(csrfToken: string): Promise<void> {
    await this.#sendRequest<UpdateCsrfResponseData>("UPDATE_CSRF", {
      csrfToken,
    });
  }

  /**
   * Generate a keypair for FHE operations.
   */
  async generateKeypair(): Promise<GenerateKeypairResponseData> {
    return this.#sendRequest<GenerateKeypairResponseData>("GENERATE_KEYPAIR", {});
  }

  /**
   * Create EIP712 typed data for user decryption authorization.
   */
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

  /**
   * Encrypt values for use in smart contract calls.
   */
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

  /**
   * Decrypt ciphertexts using user's private key.
   */
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

  /**
   * Public decryption - no authorization needed.
   */
  async publicDecrypt(handles: string[]): Promise<PublicDecryptResponseData> {
    return this.#sendRequest<PublicDecryptResponseData>("PUBLIC_DECRYPT", {
      handles,
    });
  }

  /**
   * Create EIP712 typed data for delegated user decryption authorization.
   */
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

  /**
   * Decrypt ciphertexts via delegation.
   */
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

  /**
   * Submit a ZK proof to the relayer for verification.
   */
  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.#sendRequest<RequestZKProofVerificationResponseData>(
      "REQUEST_ZK_PROOF_VERIFICATION",
      { zkProof },
    );
  }

  /**
   * Get the TFHE compact public key.
   */
  async getPublicKey(): Promise<GetPublicKeyResponseData> {
    return this.#sendRequest<GetPublicKeyResponseData>("GET_PUBLIC_KEY", {});
  }

  /**
   * Get public parameters for encryption capacity.
   */
  async getPublicParams(bits: number): Promise<GetPublicParamsResponseData> {
    return this.#sendRequest<GetPublicParamsResponseData>("GET_PUBLIC_PARAMS", {
      bits,
    });
  }

  /**
   * Generate a unique request ID.
   */
  #generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * Send a request to the worker and wait for response.
   */
  #sendRequestTo<T>(
    worker: Worker,
    type: WorkerRequestType,
    payload: WorkerRequest["payload"],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.#generateRequestId();

      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(new Error(`Request ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.#pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
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
      const id = this.#generateRequestId();

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(new Error(`Request ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Track pending request
      this.#pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      // Send request to worker
      const request = { id, type, payload } as WorkerRequest;
      worker.postMessage(request);
    });
  }

  /**
   * Handle messages from the worker.
   */
  #handleMessage(event: MessageEvent<WorkerResponse<unknown>>): void {
    const response = event.data;
    const pending = this.#pendingRequests.get(response.id);

    if (!pending) {
      console.warn("[WorkerClient] Received response for unknown request:", response.id);
      return;
    }

    // Clean up
    clearTimeout(pending.timeoutId);
    this.#pendingRequests.delete(response.id);

    // Resolve or reject
    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  /**
   * Handle worker errors.
   */
  #handleError(event: ErrorEvent): void {
    console.error("[WorkerClient] Worker error:", event.message);
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending(`Worker error: ${event.message}`);
    worker?.terminate();
  }

  /**
   * Handle message deserialization errors (e.g. structured clone failures).
   */
  #handleMessageError(): void {
    console.error("[WorkerClient] Message deserialization failed");
    const worker = this.#worker;
    this.#worker = null;
    this.#rejectAllPending("Worker message deserialization failed");
    worker?.terminate();
  }

  /**
   * Reject all pending requests with a given error message.
   */
  #rejectAllPending(message: string): void {
    for (const [id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.#pendingRequests.delete(id);
    }
  }
}
