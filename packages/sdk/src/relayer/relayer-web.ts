import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { ConfigurationError, EncryptionFailedError, ZamaError } from "../token/errors";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import { FheArtifactCache } from "./fhe-artifact-cache";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ArtifactCacheStorage,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  RelayerSDKStatus,
  RelayerWebConfig,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { buildEIP712DomainType, DefaultConfigs, withRetry } from "./relayer-utils";
import { IndexedDBStorage } from "../token/indexeddb-storage";

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
  #cache: FheArtifactCache | null = null;
  #artifactStorage: ArtifactCacheStorage | null = null;
  #status: RelayerSDKStatus = "idle";
  #initError: Error | undefined;
  readonly #config: RelayerWebConfig;

  constructor(config: RelayerWebConfig) {
    this.#config = config;
  }

  /** Current WASM initialization status. */
  get status(): RelayerSDKStatus {
    return this.#status;
  }

  /** The error that caused initialization to fail, if `status` is `"error"`. */
  get initError(): Error | undefined {
    return this.#initError;
  }

  #setStatus(status: RelayerSDKStatus, error?: Error): void {
    this.#status = status;
    this.#initError = error;
    this.#config.onStatusChange?.(status, error);
  }

  async #getWorkerConfig(): Promise<WorkerClientConfig> {
    const chainId = await this.#config.getChainId();
    const { transports, security, threads } = this.#config;

    if (threads !== undefined && (!Number.isInteger(threads) || threads < 1)) {
      throw new Error(`Invalid thread count: ${threads}. Must be a positive integer.`);
    }

    if (threads !== undefined && globalThis.SharedArrayBuffer === undefined) {
      this.#config.logger?.warn(
        "threads option requires SharedArrayBuffer (COOP/COEP headers). Falling back to single-threaded.",
      );
    }

    return {
      cdnUrl: CDN_URL,
      fhevmConfig: Object.assign({}, DefaultConfigs[chainId], transports[chainId]),
      csrfToken: security?.getCsrfToken?.() ?? "",
      integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
      logger: this.#config.logger,
      // Public API uses `threads` (plural, "how many threads"); upstream
      // `initSDK` expects `thread` (singular) — rename at the boundary.
      thread: threads,
    };
  }

  /**
   * Ensure the worker is initialized.
   * Uses a promise lock to prevent concurrent initialization.
   * Resets on failure to allow retries.
   */
  async #ensureWorker(): Promise<RelayerWorkerClient> {
    if (this.#ensureLock) {
      return this.#ensureLock;
    }
    this.#ensureLock = this.#ensureWorkerInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  #tearDown(): void {
    this.#workerClient?.terminate();
    this.#workerClient = null;
    this.#initPromise = null;
    this.#cache = null;
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
      this.#tearDown();
    }

    this.#resolvedChainId = chainId;

    // Create cache for current chain.
    // Storage is chain-independent — reuse across chain switches.
    if (!this.#artifactStorage) {
      this.#artifactStorage =
        this.#config.artifactCacheStorage ??
        new IndexedDBStorage("FheArtifactCache", 1, "artifacts");
    }
    if (!this.#cache) {
      const config = Object.assign({}, DefaultConfigs[chainId], this.#config.transports[chainId]);
      this.#cache = new FheArtifactCache({
        storage: this.#artifactStorage,
        chainId,
        relayerUrl: config.relayerUrl,
        ttl: this.#config.artifactCacheTTL,
        logger: this.#config.logger,
      });
    }

    // Revalidate cached artifacts if due
    if (this.#cache) {
      const stale = await this.#cache.revalidateIfDue();
      if (stale) {
        this.#config.logger?.info("Cached FHE artifacts are stale — reinitializing");
        this.#tearDown();
      }
    }

    if (!this.#initPromise) {
      this.#setStatus("initializing");
      this.#initPromise = this.#initWorker()
        .then((client) => {
          this.#setStatus("ready");
          return client;
        })
        .catch((error) => {
          this.#initPromise = null;
          const wrappedError =
            error instanceof ZamaError
              ? error
              : new EncryptionFailedError("Failed to initialize FHE worker", {
                  cause: error instanceof Error ? error : undefined,
                });
          this.#setStatus("error", wrappedError);
          throw wrappedError;
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
  async generateKeypair(): Promise<KeypairType<Hex>> {
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
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays = 7,
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
   * Each value must specify its FHE type (ebool, euint8–256, eaddress).
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const { values, contractAddress, userAddress } = params;

    return withRetry(async () => {
      const worker = await this.#ensureWorker();
      await this.#refreshCsrfToken();
      const result = await worker.encrypt({
        values,
        contractAddress,
        userAddress,
      });
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  /**
   * Decrypt ciphertexts using user's private key.
   * Requires a valid EIP712 signature.
   */
  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
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
  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
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
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays = 7,
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
  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
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
   * When storage is configured, the result is cached persistently.
   */
  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const worker = await this.#ensureWorker();
    if (this.#cache) {
      return this.#cache.getPublicKey(async () => (await worker.getPublicKey()).result);
    }
    return (await worker.getPublicKey()).result;
  }

  /**
   * Get public parameters for encryption capacity.
   * When storage is configured, the result is cached persistently.
   */
  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const worker = await this.#ensureWorker();
    if (this.#cache) {
      return this.#cache.getPublicParams(
        bits,
        async () => (await worker.getPublicParams(bits)).result,
      );
    }
    return (await worker.getPublicParams(bits)).result;
  }

  async getAclAddress(): Promise<Address> {
    const chainId = await this.#config.getChainId();
    const config = Object.assign({}, DefaultConfigs[chainId], this.#config.transports[chainId]);
    if (!config.aclContractAddress) {
      throw new ConfigurationError(`No ACL address configured for chain ${chainId}`);
    }
    return config.aclContractAddress as Address;
  }
}
