import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node";
import type { RelayerSDK } from "./relayer-sdk";
import { buildEIP712DomainType, mergeFhevmConfig, withRetry } from "./relayer-utils";
import { ZamaError, EncryptionFailedError } from "../token/errors";
import type {
  Address,
  DecryptedValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";
import { NodeWorkerPool, type NodeWorkerPoolConfig } from "../worker/worker.node-pool";

export interface RelayerNodeConfig {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation; the pool is re-initialized when the value changes. */
  getChainId: () => Promise<number>;
  poolSize?: number;
  /** Optional logger for observing worker lifecycle and request timing. */
  logger?: import("../worker/worker.types").GenericLogger;
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
export class RelayerNode implements RelayerSDK {
  readonly #config: RelayerNodeConfig;
  #pool: NodeWorkerPool | null = null;
  #initPromise: Promise<NodeWorkerPool> | null = null;
  #ensureLock: Promise<NodeWorkerPool> | null = null;
  #terminated = false;
  #resolvedChainId: number | null = null;

  constructor(config: RelayerNodeConfig) {
    this.#config = config;
  }

  async #getPoolConfig(): Promise<NodeWorkerPoolConfig> {
    const chainId = await this.#config.getChainId();
    const { transports, poolSize } = this.#config;

    return {
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
      poolSize,
      logger: this.#config.logger,
    };
  }

  async #ensurePool(): Promise<NodeWorkerPool> {
    if (this.#ensureLock) return this.#ensureLock;
    this.#ensureLock = this.#ensurePoolInner();
    try {
      return await this.#ensureLock;
    } finally {
      this.#ensureLock = null;
    }
  }

  async #ensurePoolInner(): Promise<NodeWorkerPool> {
    if (this.#terminated) {
      throw new EncryptionFailedError("RelayerNode has been terminated");
    }

    const chainId = await this.#config.getChainId();

    // Chain changed → tear down old pool, re-init
    if (this.#resolvedChainId !== null && chainId !== this.#resolvedChainId) {
      this.#pool?.terminate();
      this.#pool = null;
      this.#initPromise = null;
    }

    this.#resolvedChainId = chainId;

    if (!this.#initPromise) {
      this.#initPromise = this.#initPool().catch((error) => {
        this.#initPromise = null;
        throw error instanceof ZamaError
          ? error
          : new EncryptionFailedError("Failed to initialize FHE worker pool", {
              cause: error instanceof Error ? error : undefined,
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

  async generateKeypair(): Promise<FHEKeypair> {
    const pool = await this.#ensurePool();
    const result = await pool.generateKeypair();
    return {
      publicKey: result.publicKey,
      privateKey: result.privateKey,
    };
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const pool = await this.#ensurePool();
    const result = await pool.createEIP712({
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

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.encrypt(params);
      return { handles: result.handles, inputProof: result.inputProof };
    });
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, DecryptedValue>> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.userDecrypt(params);
      return result.clearValues;
    });
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
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
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const pool = await this.#ensurePool();
    return pool.createDelegatedUserDecryptEIP712({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    });
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Record<string, DecryptedValue>> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      const result = await pool.delegatedUserDecrypt(params);
      return result.clearValues;
    });
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return withRetry(async () => {
      const pool = await this.#ensurePool();
      return pool.requestZKProofVerification(zkProof);
    });
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const pool = await this.#ensurePool();
    return (await pool.getPublicKey()).result;
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const pool = await this.#ensurePool();
    return (await pool.getPublicParams(bits)).result;
  }
}
