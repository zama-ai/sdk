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
   * several MB — keep this on a SQLite-backed store, never on
   * `SecureStoreAdapter` (designed for small secrets, not multi-MB blobs).
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
 * ## Initialization / promise-chain pattern
 *
 * Every public method calls `#ensureInstance()` before proceeding. Two
 * fields back the lifecycle:
 *
 * - `#initPromise` — cached promise from `#initInstance()`; once resolved,
 *   subsequent callers reuse the same instance without re-initializing.
 *   Cleared on error so the next caller retries a fresh init, and on
 *   chain-switch so a new instance is built for the new chain.
 * - `#chain` — a promise that every `#ensureInstance` call chains onto.
 *   This serializes chain-id reads, teardown decisions, and `#initPromise`
 *   assignment, so two concurrent callers can never both decide "chain
 *   changed, tear down" or "artifacts stale, tear down" simultaneously.
 *   The fast path stays cheap because `#ensureInstanceInner` returns the
 *   already-resolved `#initPromise` in one microtask when nothing changed.
 *
 * Chain switching: when `getChainId()` returns a value different from the
 * previously resolved chain, the old instance is discarded and a fresh one
 * is created.
 */
export class RelayerNative implements RelayerSDK, Disposable {
  #initPromise: Promise<FhevmInstance> | null = null;
  #chain: Promise<unknown> = Promise.resolve();
  #terminated = false;
  #resolvedChainId: number | null = null;
  #artifactCache: FheArtifactCache | null = null;
  #artifactStorage: GenericStorage | null = null;
  #status: RelayerSDKStatus = "idle";
  #initError: Error | undefined;
  readonly #config: RelayerNativeConfig;
  readonly #logger: GenericLogger;

  constructor(config: RelayerNativeConfig) {
    this.#config = config;
    // Default to `console` so revalidation warnings are never silently
    // swallowed. Callers that want silence can pass a no-op logger.
    this.#logger = config.logger ?? console;
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
    const preset = DefaultConfigs[chainId];
    const override = this.#config.transports[chainId];
    // `Object.assign({}, undefined, undefined)` returns `{}` — truthy but
    // empty, so a bare `!merged` check would never fire. Validate that
    // at least one source of truth exists before merging.
    if (!preset && !override) {
      throw new ConfigurationError(
        `No transport config registered for chain ${chainId}. ` +
          `Add it to RelayerNativeConfig.transports.`,
      );
    }
    return Object.assign({}, preset, override) as FhevmInstanceConfig;
  }

  /**
   * Ensure the native instance is initialized. Each call chains onto the
   * previous one so chain-switch detection and teardown happen atomically;
   * the happy path (instance already initialized, no chain change) resolves
   * in one microtask because `#ensureInstanceInner` returns the cached
   * `#initPromise` immediately.
   *
   * Prior errors are swallowed from the chain so a single transient failure
   * doesn't brick subsequent callers — each caller re-enters
   * `#ensureInstanceInner` which will retry initialization.
   */
  async #ensureInstance(): Promise<FhevmInstance> {
    const prev = this.#chain;
    const next = prev.then(
      () => this.#ensureInstanceInner(),
      () => this.#ensureInstanceInner(),
    );
    this.#chain = next;
    return next;
  }

  #tearDown(): void {
    this.#initPromise = null;
    this.#artifactCache = null;
  }

  #ensureArtifactCache(chainId: number): void {
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
        logger: this.#logger,
      });
    }
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

    // Storage is chain-independent — reuse across chain switches.
    this.#ensureArtifactCache(chainId);

    // Revalidate cached artifacts if due. Failure is non-fatal — we proceed
    // with the (potentially stale) cache rather than blocking init on a
    // transient network blip. Warnings are routed through the configured
    // logger (defaulting to `console`) so the condition is visible.
    if (this.#artifactCache) {
      let stale = false;
      try {
        stale = await this.#artifactCache.revalidateIfDue();
      } catch (err) {
        this.#logger.warn?.(
          "Artifact revalidation failed, proceeding with potentially stale cache",
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
      if (stale) {
        this.#logger.info?.("Cached FHE artifacts are stale — reinitializing");
        this.#tearDown();
        // Recreate the cache for this init cycle — otherwise getPublicKey /
        // getPublicParams would fall through to the uncached path for the
        // first post-revalidation call.
        this.#ensureArtifactCache(chainId);
      }
    }

    if (!this.#initPromise) {
      this.#setStatus("initializing");
      this.#initPromise = this.#initInstance(chainId)
        .then((instance) => {
          // Commit the resolved chain ID only on success, so a failed init
          // never leaves us in a "chain pinned to an un-initialized chain"
          // state that skips the re-teardown branch on the next attempt.
          this.#resolvedChainId = chainId;
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

  /** Initialize the native instance (called once via the promise chain). */
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
   *
   * In-flight callers that already captured an instance reference keep using
   * that instance — the native engine itself is not freed here (there is no
   * explicit dispose on `FhevmInstance`), so completing in-flight ops is safe.
   */
  terminate(): void {
    this.#terminated = true;
    this.#initPromise = null;
    // Keep `#chain` intact so a call issued mid-terminate still serializes
    // correctly onto the next init attempt.
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
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      return instance.createEIP712(
        publicKey,
        contractAddresses,
        startTimestamp,
        durationDays ?? 30,
      ) as Promise<EIP712TypedData>;
    });
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
    return withRetry(async () => {
      const instance = await this.#ensureInstance();
      return instance.createDelegatedUserDecryptEIP712(
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays ?? 30,
      ) as Promise<KmsDelegatedUserDecryptEIP712Type>;
    });
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
    // Pure config read — does not need to boot the native engine. Keeps this
    // callable before `#ensureInstance` has ever run (e.g. from early UI code
    // that just wants to show the ACL address).
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
