import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/node";
import type { Address, Hex } from "viem";
import { ConfigurationError } from "../errors";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import type { NodeWorkerPool } from "../worker/worker.node-pool";
import type { GenericLogger } from "../worker/worker.types";
import { FheArtifactCache } from "./fhe-artifact-cache";
import type { RelayerSDK } from "./relayer-sdk";
import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";
import type { RelayerChainConfig } from "../chains/types";
import { withRetry } from "./relayer-utils";

export interface RelayerNodeConfig {
  /** FHE chain configuration. */
  chain: RelayerChainConfig;
  /** Worker thread pool — handles WASM operations off the main thread. */
  pool: NodeWorkerPool;
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
 * RelayerNode — Node.js encryption/decryption layer.
 * The pool is injected at construction time; the relayer does not own its lifecycle.
 */
export class RelayerNode implements RelayerSDK, Disposable {
  readonly #config: RelayerNodeConfig;
  #artifactCache: FheArtifactCache | null = null;
  #initPromise: Promise<void> | null = null;

  constructor(config: RelayerNodeConfig) {
    this.#config = { fheArtifactStorage: new MemoryStorage(), ...config };
  }

  get #pool(): NodeWorkerPool {
    return this.#config.pool;
  }

  async #ensurePool(): Promise<void> {
    if (!this.#initPromise) {
      this.#initPromise = this.#pool.initPool();
    }
    return this.#initPromise;
  }

  #getArtifactCache(): FheArtifactCache | null {
    if (!this.#config.fheArtifactStorage) {
      return null;
    }
    if (!this.#artifactCache) {
      this.#artifactCache = new FheArtifactCache({
        storage: this.#config.fheArtifactStorage,
        chainId: this.#config.chain.chainId,
        relayerUrl: this.#config.chain.relayerUrl,
        ttl: this.#config.fheArtifactCacheTTL,
        logger: this.#config.logger,
      });
    }
    return this.#artifactCache;
  }

  /**
   * Terminate clears the artifact cache only.
   * The pool is externally owned — the relayer does not terminate it.
   */
  terminate(): void {
    this.#artifactCache = null;
    this.#initPromise = null;
  }

  /** Calls {@link terminate}. */
  [Symbol.dispose](): void {
    this.terminate();
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    const result = await this.#pool.generateKeypair({ chainId });
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
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return this.#pool.createEIP712({
      chainId,
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      const result = await this.#pool.encrypt({ chainId, ...params });
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      const result = await this.#pool.userDecrypt({ chainId, ...params });
      return result.clearValues;
    });
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      const result = await this.#pool.publicDecrypt({ chainId, handles });
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
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return this.#pool.createDelegatedUserDecryptEIP712({
      chainId,
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    });
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      const result = await this.#pool.delegatedUserDecrypt({
        chainId,
        ...params,
      });
      return result.clearValues;
    });
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      return this.#pool.requestZKProofVerification({ chainId, zkProof });
    });
  }

  async getPublicKey(): Promise<PublicKeyData | null> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    const artifactCache = this.#getArtifactCache();
    if (artifactCache) {
      return artifactCache.getPublicKey(
        async () => (await this.#pool.getPublicKey({ chainId })).result,
      );
    }
    return (await this.#pool.getPublicKey({ chainId })).result;
  }

  async getPublicParams(bits: number): Promise<PublicParamsData | null> {
    await this.#ensurePool();
    const { chainId } = this.#config.chain;
    const artifactCache = this.#getArtifactCache();
    if (artifactCache) {
      return artifactCache.getPublicParams(
        bits,
        async () => (await this.#pool.getPublicParams({ chainId, bits })).result,
      );
    }
    return (await this.#pool.getPublicParams({ chainId, bits })).result;
  }

  async getAclAddress(): Promise<Address> {
    if (!this.#config.chain.aclContractAddress) {
      throw new ConfigurationError(
        `No ACL address configured for chain ${this.#config.chain.chainId}`,
      );
    }
    return this.#config.chain.aclContractAddress as Address;
  }
}
