import { createInstance } from "@fhevm/react-native-sdk";
import type {
  FhevmInstance,
  FhevmInstanceConfig,
  EncryptedInput,
  HandleContractPair,
} from "@fhevm/react-native-sdk";
import {
  ConfigurationError,
  DefaultConfigs,
  FheArtifactCache,
  withRetry,
  ZamaError,
  type Address,
  type ClearValueType,
  type DelegatedUserDecryptParams,
  type EIP712TypedData,
  type EncryptInput as SDKEncryptInput,
  type EncryptParams,
  type EncryptResult,
  type GenericLogger,
  type GenericStorage,
  type Handle,
  type Hex,
  type InputProofBytesType,
  type KeypairType,
  type KmsDelegatedUserDecryptEIP712Type,
  type PublicDecryptResult,
  type RelayerSDK,
  type RelayerSDKStatus,
  type UserDecryptParams,
  type ZKProofLike,
} from "@zama-fhe/sdk";
import { SqliteKvStoreAdapter } from "./sqlite-kv-store-adapter";

/**
 * Configuration for {@link RelayerNative}, mirroring `RelayerWebConfig` so
 * that web → native migrations are a one-line constructor swap.
 *
 * Fields intentionally absent vs. `RelayerWebConfig`:
 * - `security` (CSRF / CDN integrity): native modules do not load remote
 *   scripts, so neither concern applies.
 * - `threads`: native FHE engine manages its own thread pool internally;
 *   there is no SAB/COOP/COEP knob to tune.
 */
export interface RelayerNativeConfig {
  /**
   * Per-chain partial overrides merged on top of `DefaultConfigs[chainId]`
   * before being handed to the native engine's `createInstance`.
   *
   * Example:
   * ```ts
   * { 11155111: SepoliaConfig }
   * ```
   */
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  /**
   * Resolve the current chain ID. Called lazily before each operation; the
   * native instance is torn down and re-initialized when the value changes.
   */
  getChainId: () => Promise<number>;
  /** Optional logger for observing relayer lifecycle and request timing. */
  logger?: GenericLogger;
  /** Called whenever the SDK status changes (e.g. idle → initializing → ready). */
  onStatusChange?: (status: RelayerSDKStatus, error?: Error) => void;
  /**
   * Persistent storage for caching FHE public key and params across sessions.
   *
   * Defaults to a fresh `SqliteKvStoreAdapter`. FHE public params can reach
   * several MB — keep this on a SQLite-backed store, never on SecureStore
   * (iOS Keychain caps entries at ~2 KB).
   *
   * **Not to be confused with `ZamaProvider.storage`** which stores credentials.
   */
  fheArtifactStorage?: GenericStorage;
  /**
   * Cache TTL in seconds for FHE public material. Default: 86 400 (24 h).
   * Set to `0` to revalidate on every operation. Ignored when storage is unset.
   */
  fheArtifactCacheTTL?: number;
}

/**
 * RelayerNative — React Native encryption/decryption layer backed by the
 * native Rust FHE engine (`@fhevm/react-native-sdk`).
 *
 * Mirrors `RelayerWeb`'s lifecycle, status tracking, retry behavior, and
 * artifact caching so that the same React hooks work transparently on web
 * and native targets.
 *
 * ## Initialization / promise-lock pattern
 *
 * Every public method calls `#ensureInstance()` before proceeding.
 * Initialization is managed by three private fields:
 *
 * - `#initPromise` — cached promise from `#initInstance()`; once resolved,
 *   subsequent callers reuse the same instance without re-initializing.
 *   Cleared on error so the next caller retries a fresh init.
 * - `#ensureLock` — short-lived promise that serializes concurrent calls
 *   to `#ensureInstanceInner()` (chain-id check + potential tear-down).
 *
 * Chain switching: when `getChainId()` returns a value different from the
 * previously resolved chain, the old instance is discarded and a fresh one
 * is created — all within the `#ensureLock` critical section.
 */
export class RelayerNative implements RelayerSDK, Disposable {
  #initPromise: Promise<FhevmInstance> | null = null;
  #ensureLock: Promise<FhevmInstance> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;
  #artifactCache: FheArtifactCache | null = null;
  #artifactStorage: GenericStorage | null = null;
  #status: RelayerSDKStatus = "idle";
  #initError: Error | undefined;
  readonly #config: RelayerNativeConfig;

  constructor(config: RelayerNativeConfig) {
    this.#config = config;
  }

  /** Current native instance initialization status. */
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

  #resolveInstanceConfig(chainId: number): FhevmInstanceConfig {
    const merged = Object.assign(
      {},
      DefaultConfigs[chainId],
      this.#config.transports[chainId],
    ) as FhevmInstanceConfig;
    if (!merged) {
      throw new ConfigurationError(
        `No transport config registered for chain ${chainId}. ` +
          `Add it to RelayerNativeConfig.transports.`,
      );
    }
    return merged;
  }

  /**
   * Ensure the native instance is initialized. Uses a promise lock to prevent
   * concurrent initialization. Resets on failure to allow retries.
   */
  async #ensureInstance(): Promise<FhevmInstance> {
    if (this.#ensureLock) {
      return this.#ensureLock;
    }
    this.#ensureLock = this.#ensureInstanceInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  #tearDown(): void {
    this.#initPromise = null;
    this.#artifactCache = null;
  }

  async #ensureInstanceInner(): Promise<FhevmInstance> {
    // Auto-restart after terminate() — supports React StrictMode's
    // unmount→remount cycle and HMR without permanently bricking the relayer.
    if (this.#terminated) {
      this.#terminated = false;
      this.#initPromise = null;
      this.#resolvedChainId = null;
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → discard old instance, re-init for the new chain.
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#tearDown();
    }

    this.#resolvedChainId = chainId;

    // Storage is chain-independent — reuse across chain switches.
    if (!this.#artifactStorage) {
      this.#artifactStorage = this.#config.fheArtifactStorage ?? new SqliteKvStoreAdapter();
    }
    if (!this.#artifactCache) {
      const config = this.#resolveInstanceConfig(chainId);
      this.#artifactCache = new FheArtifactCache({
        storage: this.#artifactStorage,
        chainId,
        relayerUrl: config.relayerUrl,
        ttl: this.#config.fheArtifactCacheTTL,
        logger: this.#config.logger,
      });
    }

    // Revalidate cached artifacts if due — never let revalidation block init.
    if (this.#artifactCache) {
      let stale = false;
      try {
        stale = await this.#artifactCache.revalidateIfDue();
      } catch (err) {
        this.#config.logger?.warn(
          "Artifact revalidation failed, proceeding with potentially stale cache",
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
      if (stale) {
        this.#config.logger?.info("Cached FHE artifacts are stale — reinitializing");
        this.#tearDown();
      }
    }

    if (!this.#initPromise) {
      this.#setStatus("initializing");
      this.#initPromise = this.#initInstance(chainId)
        .then((instance) => {
          this.#setStatus("ready");
          return instance;
        })
        .catch((error: unknown) => {
          this.#initPromise = null;
          const wrappedError =
            error instanceof ZamaError
              ? error
              : new ConfigurationError("Failed to initialize native FHE instance", {
                  cause: error,
                });
          this.#setStatus("error", wrappedError);
          throw wrappedError;
        });
    }
    return this.#initPromise;
  }

  /** Initialize the native instance (called once via the promise lock). */
  async #initInstance(chainId: number): Promise<FhevmInstance> {
    const config = this.#resolveInstanceConfig(chainId);
    const instance = await createInstance(config);
    // If terminate() was called while we were initializing, drop the instance
    // and surface the cancellation as an error so the awaiting callers retry.
    if (this.#terminated) {
      throw new Error("RelayerNative was terminated during initialization");
    }
    return instance;
  }

  /**
   * Terminate the relayer and clear cached state. The next public-method call
   * will transparently re-initialize, so this is safe to call from React
   * unmount/cleanup paths.
   */
  terminate(): void {
    this.#terminated = true;
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  /** Calls {@link terminate}, satisfying the `Disposable` interface. */
  [Symbol.dispose](): void {
    this.terminate();
  }

  // ── RelayerSDK implementation ────────────────────────────────────────

  async generateKeypair(): Promise<KeypairType<Hex>> {
    const instance = await this.#ensureInstance();
    const kp = await instance.generateKeypair();
    return { publicKey: kp.publicKey as Hex, privateKey: kp.privateKey as Hex };
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData> {
    const instance = await this.#ensureInstance();
    return instance.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays ?? 30,
    ) as Promise<EIP712TypedData>;
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      const builder = instance.createEncryptedInput(params.contractAddress, params.userAddress);
      for (const input of params.values) {
        addToBuilder(builder, input);
      }
      return builder.encrypt();
    });
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      const handleContractPairs: HandleContractPair[] = params.handles.map((handle) => ({
        handle,
        contractAddress: params.contractAddress,
      }));
      return instance.userDecrypt(
        handleContractPairs,
        params.privateKey,
        params.publicKey,
        params.signature,
        params.signedContractAddresses,
        params.signerAddress,
        params.startTimestamp,
        params.durationDays,
      );
    });
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      const result = await instance.publicDecrypt(handles);
      return {
        clearValues: result.clearValues as Readonly<Record<Handle, ClearValueType>>,
        abiEncodedClearValues: result.abiEncodedClearValues as Hex,
        decryptionProof: result.decryptionProof as Hex,
      };
    });
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const instance = await this.#ensureInstance();
    return instance.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays ?? 30,
    ) as Promise<KmsDelegatedUserDecryptEIP712Type>;
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      const handleContractPairs: HandleContractPair[] = params.handles.map((handle) => ({
        handle,
        contractAddress: params.contractAddress,
      }));
      return instance.delegatedUserDecrypt(
        handleContractPairs,
        params.privateKey,
        params.publicKey,
        params.signature,
        params.signedContractAddresses,
        params.delegatorAddress,
        params.delegateAddress,
        params.startTimestamp,
        params.durationDays,
      );
    });
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      return instance.requestZKProofVerification(zkProof);
    });
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const instance = await this.#ensureInstance();
    if (this.#artifactCache) {
      return this.#artifactCache.getPublicKey(async () => {
        const pk = await instance.getPublicKey();
        if (!pk) {
          throw new Error("Native engine returned null publicKey");
        }
        return pk;
      });
    }
    return instance.getPublicKey();
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const instance = await this.#ensureInstance();
    if (this.#artifactCache) {
      return this.#artifactCache.getPublicParams(bits, async () => {
        const pp = await instance.getPublicParams(bits);
        if (!pp) {
          throw new Error(`Native engine returned null publicParams for ${bits} bits`);
        }
        return pp;
      });
    }
    return instance.getPublicParams(bits);
  }

  async getAclAddress(): Promise<Address> {
    const chainId = await this.#config.getChainId();
    const config = this.#resolveInstanceConfig(chainId);
    if (!config.aclContractAddress) {
      throw new ConfigurationError(`No ACL address configured for chain ${chainId}`);
    }
    return config.aclContractAddress as Address;
  }
}

// ── Builder mapping ──────────────────────────────────────────────────

function addToBuilder(builder: EncryptedInput, input: SDKEncryptInput): void {
  switch (input.type) {
    case "ebool":
      builder.addBool(input.value);
      break;
    case "euint8":
      builder.add8(input.value);
      break;
    case "euint16":
      builder.add16(input.value);
      break;
    case "euint32":
      builder.add32(input.value);
      break;
    case "euint64":
      builder.add64(input.value);
      break;
    case "euint128":
      builder.add128(input.value);
      break;
    case "euint256":
      builder.add256(input.value);
      break;
    case "eaddress":
      builder.addAddress(input.value);
      break;
    default: {
      // Exhaustive-check: if a new FHE type is added upstream, TypeScript
      // will fail this assignment, forcing us to handle it. At runtime, an
      // unrecognized type would otherwise silently drop the input and produce
      // an EncryptResult missing handles.
      const _exhaustive: never = input;
      throw new Error(
        `Unsupported FHE type "${(input as SDKEncryptInput).type}" in addToBuilder. ` +
          "The react-native-sdk version may need an update to support this type.",
      );
    }
  }
}
