import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  RelayerWebConfig,
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import type { RelayerSDK } from "./relayer-sdk";
import { buildEIP712DomainType, mergeFhevmConfig, withRetry } from "./relayer-utils";
import { ZamaError, EncryptionFailedError } from "../token/errors";

/**
 * Pinned relayer SDK version used for the WASM CDN bundle.
 * Update this when upgrading @zama-fhe/relayer-sdk, and keep the
 * peerDependencies range in package.json in sync (~x.y.z).
 */
const RELAYER_SDK_VERSION = "0.4.1";
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
/** SHA-384 hex digest of the pinned CDN bundle for integrity verification. */
const CDN_INTEGRITY =
  "2bd5401738b74509549bed2029bbbabedd481b10ac260f66e64a4ff3723d6d704180c51e882757c56ca1840491e90e33";

/**
 * RelayerWeb — browser encryption/decryption layer using a Web Worker.
 * Handles WASM initialization in a Web Worker for non-blocking operations.
 *
 * ## Worker initialization / promise lock pattern
 *
 * Every public method calls `#ensureWorker()` before proceeding.
 * Initialization is managed by three private fields:
 *
 * - `#workerClient` — the live worker instance (null until first init)
 * - `#initPromise` — cached promise from `#initWorker()`; once resolved,
 *   all subsequent callers reuse the same worker without re-initializing.
 *   Cleared on error so the next caller retries a fresh init.
 * - `#ensureLock` — short-lived promise that serializes concurrent calls
 *   to `#ensureWorkerInner()`. While one caller is checking chain IDs and
 *   potentially tearing down an old worker, all other callers await the
 *   same lock instead of racing through the same logic. Cleared in
 *   `finally` so it's never leaked.
 *
 * Chain switching: when `getChainId()` returns a value different from the
 * previously resolved chain, the old worker is terminated, `#initPromise`
 * is cleared, and a fresh worker is created for the new chain — all within
 * the `#ensureLock` critical section.
 */
export class RelayerWeb implements RelayerSDK {
  #workerClient: RelayerWorkerClient | null = null;
  #initPromise: Promise<RelayerWorkerClient> | null = null;
  #ensureLock: Promise<RelayerWorkerClient> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;
  readonly #config: RelayerWebConfig;

  constructor(config: RelayerWebConfig) {
    this.#config = config;
  }

  async #getWorkerConfig(): Promise<WorkerClientConfig> {
    const chainId = await this.#config.getChainId();
    const { transports, security } = this.#config;

    return {
      cdnUrl: CDN_URL,
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
      csrfToken: security?.getCsrfToken?.() ?? "",
      integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
      logger: this.#config.logger,
      thread: this.#config.threads,
    };
  }

  /**
   * Ensure the worker is initialized.
   * Uses a promise lock to prevent concurrent initialization.
   * Resets on failure to allow retries.
   */
  async #ensureWorker(): Promise<RelayerWorkerClient> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensureWorkerInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  async #ensureWorkerInner(): Promise<RelayerWorkerClient> {
    // Auto-restart after terminate() — supports React StrictMode's
    // unmount→remount cycle and HMR without permanently killing the worker.
    if (this.#terminated) {
      this.#terminated = false;
      this.#workerClient = null;
      this.#initPromise = null;
      this.#resolvedChainId = null;
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → tear down old worker, re-init
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#workerClient?.terminate();
      this.#workerClient = null;
      this.#initPromise = null;
    }

    this.#resolvedChainId = chainId;

    if (!this.#initPromise) {
      this.#initPromise = this.#initWorker().catch((error) => {
        this.#initPromise = null;
        throw error instanceof ZamaError
          ? error
          : new EncryptionFailedError("Failed to initialize FHE worker", {
              cause: error instanceof Error ? error : undefined,
            });
      });
    }
    return this.#initPromise;
  }

  /**
   * Initialize the worker (called once via promise lock).
   */
  async #initWorker(): Promise<RelayerWorkerClient> {
    const workerConfig = await this.#getWorkerConfig();
    const client = new RelayerWorkerClient(workerConfig);
    await client.initWorker();
    // If terminate() was called while we were initializing, clean up immediately
    if (this.#terminated) {
      client.terminate();
      throw new Error("RelayerWeb was terminated during initialization");
    }
    this.#workerClient = client;
    return client;
  }

  /**
   * Terminate the worker and clean up resources.
   * Call this when the SDK is no longer needed.
   */
  terminate(): void {
    this.#terminated = true;
    if (this.#workerClient) {
      this.#workerClient.terminate();
      this.#workerClient = null;
    }
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  /**
   * Refresh the CSRF token in the worker.
   * Call this before making authenticated network requests.
   */
  async #refreshCsrfToken(): Promise<void> {
    if (this.#workerClient) {
      const token = this.#config.security?.getCsrfToken?.() ?? "";
      if (token) {
        await this.#workerClient.updateCsrf(token);
      }
    }
  }

  /**
   * Generate a keypair for FHE operations.
   */
  async generateKeypair(): Promise<FHEKeypair> {
    const worker = await this.#ensureWorker();
    const result = await worker.generateKeypair();
    return {
      publicKey: result.publicKey,
      privateKey: result.privateKey,
    };
  }

  /**
   * Create EIP712 typed data for user decryption authorization.
   */
  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const worker = await this.#ensureWorker();
    const result = await worker.createEIP712({
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });

    const domain = {
      name: result.domain.name,
      version: result.domain.version,
      chainId: result.domain.chainId,
      verifyingContract: result.domain.verifyingContract,
    };

    return {
      domain,
      types: {
        EIP712Domain: buildEIP712DomainType(domain),
        UserDecryptRequestVerification: result.types.UserDecryptRequestVerification,
      },
      message: {
        publicKey: result.message.publicKey,
        contractAddresses: result.message.contractAddresses,
        startTimestamp: result.message.startTimestamp,
        durationDays: result.message.durationDays,
        extraData: result.message.extraData,
      },
    };
  }

  /**
   * Encrypt values for use in smart contract calls.
   * All values are treated as 64-bit unsigned integers.
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const { values, contractAddress, userAddress } = params;

    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      const result = await worker.encrypt({ values, contractAddress, userAddress });
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  /**
   * Decrypt ciphertexts using user's private key.
   * Requires a valid EIP712 signature.
   */
  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      const result = await worker.userDecrypt(params);
      return result.clearValues;
    });
  }

  /**
   * Public decryption - no authorization needed.
   * Used for publicly visible encrypted values.
   */
  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      const result = await worker.publicDecrypt(handles);
      return {
        clearValues: result.clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof,
      };
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
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const worker = await this.#ensureWorker();
    return worker.createDelegatedUserDecryptEIP712({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    });
  }

  /**
   * Decrypt ciphertexts via delegation.
   * Requires a valid EIP712 signature from the delegator.
   */
  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      const result = await worker.delegatedUserDecrypt(params);
      return result.clearValues;
    });
  }

  /**
   * Submit a ZK proof to the relayer for verification.
   */
  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      return worker.requestZKProofVerification(zkProof);
    });
  }

  /**
   * Get the TFHE compact public key.
   */
  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicKey()).result;
  }

  /**
   * Get public parameters for encryption capacity.
   */
  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicParams(bits)).result;
  }
}
