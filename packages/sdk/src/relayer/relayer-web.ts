import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { Address, Hex } from "viem";
import { ConfigurationError } from "../errors";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import type { GenericStorage } from "../types";
import type { RelayerWorkerClient } from "../worker/worker.client";
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
  RelayerWebConfig,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { withRetry } from "./relayer-utils";

/**
 * Pinned relayer SDK version used for the WASM CDN bundle.
 * Update this when upgrading @zama-fhe/relayer-sdk, and keep the
 * peerDependencies range in package.json in sync (~x.y.z).
 */
export const RELAYER_SDK_VERSION = "0.4.2";
export const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
/** SHA-384 hex digest of the pinned CDN bundle for integrity verification. */
export const CDN_INTEGRITY =
  "114438b01d518b53a447fa3e8bfbe6e71031cb42ac43219bb9f53488456fdfa4bbc8989628366d436e68f6526c7647eb";

/**
 * RelayerWeb — single-chain browser encryption/decryption layer.
 * The worker is injected at construction time; the relayer does not own its lifecycle.
 */
export class RelayerWeb implements RelayerSDK, Disposable {
  #artifactCache: FheArtifactCache | null = null;
  #artifactStorage: GenericStorage | null = null;
  #initPromise: Promise<Worker> | null = null;
  readonly #config: RelayerWebConfig;

  constructor(config: RelayerWebConfig) {
    this.#config = config;
  }

  get #worker(): RelayerWorkerClient {
    return this.#config.worker;
  }

  async #ensureWorker(): Promise<Worker> {
    if (!this.#initPromise) {
      this.#initPromise = this.#worker.initWorker().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  #getArtifactCache(): FheArtifactCache {
    if (!this.#artifactCache) {
      if (!this.#artifactStorage) {
        this.#artifactStorage =
          this.#config.fheArtifactStorage ??
          new IndexedDBStorage("FheArtifactCache", 1, "artifacts");
      }
      this.#artifactCache = new FheArtifactCache({
        storage: this.#artifactStorage,
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
   * The worker is externally owned — the relayer does not terminate it.
   */
  terminate(): void {
    this.#artifactCache = null;
    this.#initPromise = null;
  }

  /** Calls {@link terminate}. */
  [Symbol.dispose](): void {
    this.terminate();
  }

  /**
   * Refresh the CSRF token in the worker.
   * Call this before making authenticated network requests.
   */
  async #refreshCsrfToken(): Promise<void> {
    const token = this.#config.security?.getCsrfToken?.() ?? "";
    if (token) {
      await this.#worker.updateCsrf(token);
    }
  }

  /**
   * Generate a keypair for FHE operations.
   */
  async generateKeypair(): Promise<KeypairType<Hex>> {
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    const result = await this.#worker.generateKeypair({ chainId });
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
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return this.#worker.createEIP712({
      chainId,
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    });
  }

  /**
   * Encrypt values for use in smart contract calls.
   * Each value must specify its FHE type (ebool, euint8–256, eaddress).
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const { values, contractAddress, userAddress } = params;
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;

    return withRetry(async () => {
      await this.#refreshCsrfToken();
      const result = await this.#worker.encrypt({
        chainId,
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
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      await this.#refreshCsrfToken();
      const result = await this.#worker.userDecrypt({ chainId, ...params });
      return result.clearValues;
    });
  }

  /**
   * Public decryption - no authorization needed.
   * Used for publicly visible encrypted values.
   */
  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      await this.#refreshCsrfToken();
      const result = await this.#worker.publicDecrypt({ chainId, handles });
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
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return this.#worker.createDelegatedUserDecryptEIP712({
      chainId,
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
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      await this.#refreshCsrfToken();
      const result = await this.#worker.delegatedUserDecrypt({
        chainId,
        ...params,
      });
      return result.clearValues;
    });
  }

  /**
   * Submit a ZK proof to the relayer for verification.
   */
  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    return withRetry(async () => {
      await this.#refreshCsrfToken();
      return this.#worker.requestZKProofVerification({ chainId, zkProof });
    });
  }

  /**
   * Get the TFHE compact public key.
   * When storage is configured, the result is cached persistently.
   */
  async getPublicKey(): Promise<PublicKeyData | null> {
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    const artifactCache = this.#getArtifactCache();
    return artifactCache.getPublicKey(
      async () => (await this.#worker.getPublicKey({ chainId })).result,
    );
  }

  /**
   * Get public parameters for encryption capacity.
   * When storage is configured, the result is cached persistently.
   */
  async getPublicParams(bits: number): Promise<PublicParamsData | null> {
    await this.#ensureWorker();
    const { chainId } = this.#config.chain;
    const artifactCache = this.#getArtifactCache();
    return artifactCache.getPublicParams(
      bits,
      async () => (await this.#worker.getPublicParams({ chainId, bits })).result,
    );
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
