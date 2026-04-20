import type { Address, Hex } from "viem";
import { ConfigurationError, ZamaError } from "../errors";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import { NodeWorkerPool, type NodeWorkerPoolConfig } from "../worker/worker.node-pool";
import type { GenericLogger } from "../worker/worker.types";
import { FheArtifactCache } from "./fhe-artifact-cache";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FhevmInstanceConfig,
  Handle,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { DefaultConfigs, withRetry } from "./relayer-utils";

export interface RelayerNodeConfig {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation; the pool is re-initialized when the value changes. */
  getChainId: () => Promise<number>;
  poolSize?: number;
  /** Optional logger for observing worker lifecycle and request timing. */
  logger?: GenericLogger;
  /**
   * Persistent storage for caching FHE public key and params across sessions.
   * Defaults to `new MemoryStorage()` (in-process, lost on restart).
   * Pass a custom `GenericStorage` with redis for cross-restart persistence.
   */
  fheArtifactStorage?: GenericStorage;
  /** Cache TTL in seconds for FHE public material. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. */
  fheArtifactCacheTTL?: number;
}

/**
 * RelayerNode — Node.js encryption/decryption layer using a worker thread pool.
 * Offloads CPU-intensive WASM/FHE operations to `node:worker_threads`.
 *
 * Uses the same promise lock pattern as {@link RelayerWeb}:
 * `#ensureLock` serializes concurrent callers, `#initPromise` caches the
 * resolved pool, and chain switches tear down the old pool within the lock.
 * See the RelayerWeb class doc for a detailed explanation.
 */
export class RelayerNode implements RelayerSDK, Disposable {
  readonly #config: RelayerNodeConfig;
  #pool: NodeWorkerPool | null = null;
  #initPromise: Promise<NodeWorkerPool> | null = null;
  #ensureLock: Promise<NodeWorkerPool> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;
  #artifactCache: FheArtifactCache | null = null;

  constructor(config: RelayerNodeConfig) {
    this.#config = { fheArtifactStorage: new MemoryStorage(), ...config };
  }

  async #getPoolConfig(): Promise<NodeWorkerPoolConfig> {
    const chainId = await this.#config.getChainId();
    const { transports, poolSize } = this.#config;

    return {
      fhevmConfig: Object.assign({}, DefaultConfigs[chainId], transports[chainId]),
      poolSize,
      logger: this.#config.logger,
    };
  }

  async #ensurePool(): Promise<NodeWorkerPool> {
    if (this.#ensureLock) {
      return this.#ensureLock;
    }
    this.#ensureLock = this.#ensurePoolInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  #tearDown(): void {
    this.#pool?.terminate();
    this.#pool = null;
    this.#initPromise = null;
    this.#artifactCache = null;
  }

  async #ensurePoolInner(): Promise<NodeWorkerPool> {
    if (this.#terminated) {
      throw new ConfigurationError("RelayerNode has been terminated");
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → tear down old pool, re-init
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#tearDown();
    }

    this.#resolvedChainId = chainId;

    // Create cache for current chain (when storage is provided)
    if (!this.#artifactCache && this.#config.fheArtifactStorage) {
      const config = Object.assign({}, DefaultConfigs[chainId], this.#config.transports[chainId]);
      this.#artifactCache = new FheArtifactCache({
        storage: this.#config.fheArtifactStorage,
        chainId,
        relayerUrl: config.relayerUrl,
        ttl: this.#config.fheArtifactCacheTTL,
        logger: this.#config.logger,
      });
    }

    // Revalidate cached artifacts if due — never let revalidation block init
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
      this.#initPromise = this.#initPool().catch((error) => {
        this.#initPromise = null;
        throw error instanceof ZamaError
          ? error
          : new ConfigurationError("Failed to initialize FHE worker pool", {
              cause: error,
            });
      });
    }
    return this.#initPromise;
  }

  async #initPool(): Promise<NodeWorkerPool> {
    const poolConfig = await this.#getPoolConfig();
    const pool = new NodeWorkerPool(poolConfig);
    await pool.initPool();
    if (this.#terminated) {
      pool.terminate();
      throw new Error("RelayerNode was terminated during initialization");
    }
    this.#pool = pool;
    return pool;
  }

  terminate(): void {
    this.#terminated = true;
    if (this.#pool) {
      this.#pool.terminate();
      this.#pool = null;
    }
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  /** Calls {@link terminate}, shutting down the worker thread pool. */
  [Symbol.dispose](): void {
    this.terminate();
  }

  async generateKeypair(): Promise<{ publicKey: Hex; privateKey: Hex }> {
    const pool = await this.#ensurePool();
    const result = await pool.generateKeypair();
    return {
      publicKey: result.publicKey,
      privateKey: result.privateKey,
    };
  }

  async createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays = 7,
  ): Promise<EIP712TypedData> {
    const pool = await this.#ensurePool();
    return pool.createEIP712({
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.encrypt(params);
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.userDecrypt(params);
      return result.clearValues;
    });
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.publicDecrypt(handles);
      return {
        clearValues: result.clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof,
      };
    });
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays = 7,
  ): Promise<EIP712TypedData> {
    const pool = await this.#ensurePool();
    return pool.createDelegatedUserDecryptEIP712({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    }) as unknown as EIP712TypedData;
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.delegatedUserDecrypt(params);
      return result.clearValues;
    });
  }

  async requestZKProofVerification(zkProof: unknown): Promise<EncryptResult> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      return pool.requestZKProofVerification(zkProof) as unknown as Promise<EncryptResult>;
    });
  }

  async getPublicKey(): Promise<PublicKeyData | null> {
    const pool = await this.#ensurePool();
    if (this.#artifactCache) {
      return this.#artifactCache.getPublicKey(async () => (await pool.getPublicKey()).result);
    }
    return (await pool.getPublicKey()).result;
  }

  async getPublicParams(bits: number): Promise<PublicParamsData | null> {
    const pool = await this.#ensurePool();
    if (this.#artifactCache) {
      return this.#artifactCache.getPublicParams(
        bits,
        async () => (await pool.getPublicParams(bits)).result,
      );
    }
    return (await pool.getPublicParams(bits)).result;
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
