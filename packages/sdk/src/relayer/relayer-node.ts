import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/node";
import type { Address, Hex } from "viem";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import type { NodeWorkerPool } from "../worker/worker.node-pool";
import type { GenericLogger } from "../worker/worker.types";
import type { FheChain } from "../chains/types";
import { BaseRelayer } from "./base-relayer";
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
import { withRetry } from "./relayer-utils";

export interface RelayerNodeConfig {
  /** FHE chain configuration. */
  chain: FheChain;
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
export class RelayerNode extends BaseRelayer implements RelayerSDK, Disposable {
  readonly #config: RelayerNodeConfig;
  #artifactCache: FheArtifactCache | null = null;

  constructor(config: RelayerNodeConfig) {
    super();
    this.#config = { fheArtifactStorage: new MemoryStorage(), ...config };
  }

  protected get chain(): FheChain {
    return this.#config.chain;
  }

  protected async init(): Promise<void> {
    await this.#pool.initPool();
  }

  get #pool(): NodeWorkerPool {
    return this.#config.pool;
  }

  #getArtifactCache(): FheArtifactCache | null {
    if (!this.#config.fheArtifactStorage) {
      return null;
    }
    if (!this.#artifactCache) {
      this.#artifactCache = new FheArtifactCache({
        storage: this.#config.fheArtifactStorage,
        chainId: this.chain.id,
        relayerUrl: this.chain.relayerUrl,
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
    this.resetInit();
  }

  /** Calls {@link terminate}. */
  [Symbol.dispose](): void {
    this.terminate();
  }

  async generateKeypair(): Promise<KeypairType<Hex>> {
    await this.ensureInit();
    const chainId = this.chain.id;
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
    await this.ensureInit();
    const chainId = this.chain.id;
    return this.#pool.createEIP712({
      chainId,
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    await this.ensureInit();
    const chainId = this.chain.id;
    return withRetry(async () => {
      const result = await this.#pool.encrypt({ chainId, ...params });
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  async userDecrypt(
    params: UserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    await this.ensureInit();
    const chainId = this.chain.id;
    return withRetry(async () => {
      const result = await this.#pool.userDecrypt({ chainId, ...params });
      return result.clearValues;
    });
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    await this.ensureInit();
    const chainId = this.chain.id;
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
    await this.ensureInit();
    const chainId = this.chain.id;
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
    await this.ensureInit();
    const chainId = this.chain.id;
    return withRetry(async () => {
      const result = await this.#pool.delegatedUserDecrypt({
        chainId,
        ...params,
      });
      return result.clearValues;
    });
  }

  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<InputProofBytesType> {
    await this.ensureInit();
    const chainId = this.chain.id;
    return withRetry(async () => {
      return this.#pool.requestZKProofVerification({ chainId, zkProof });
    });
  }

  async getPublicKey(): Promise<PublicKeyData | null> {
    await this.ensureInit();
    const chainId = this.chain.id;
    const artifactCache = this.#getArtifactCache();
    if (artifactCache) {
      return artifactCache.getPublicKey(
        async () => (await this.#pool.getPublicKey({ chainId })).result,
      );
    }
    return (await this.#pool.getPublicKey({ chainId })).result;
  }

  async getPublicParams(bits: number): Promise<PublicParamsData | null> {
    await this.ensureInit();
    const chainId = this.chain.id;
    const artifactCache = this.#getArtifactCache();
    if (artifactCache) {
      return artifactCache.getPublicParams(
        bits,
        async () =>
          (await this.#pool.getPublicParams({ chainId, bits })).result,
      );
    }
    return (await this.#pool.getPublicParams({ chainId, bits })).result;
  }
}
