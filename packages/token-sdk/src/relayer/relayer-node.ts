import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node";
import type { RelayerSDK } from "./relayer-sdk";
import { mergeFhevmConfig } from "./relayer-utils";
import type {
  Hex,
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
  chainId: number;
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  poolSize?: number;
}

/**
 * RelayerNode — Node.js FHE backend using a worker thread.
 * Offloads CPU-intensive WASM/FHE operations to a node:worker_threads worker.
 */
export class RelayerNode implements RelayerSDK {
  readonly #config: RelayerNodeConfig;
  #pool: NodeWorkerPool | null = null;
  #initPromise: Promise<NodeWorkerPool> | null = null;

  constructor(config: RelayerNodeConfig) {
    this.#config = config;
  }

  #getPoolConfig(): NodeWorkerPoolConfig {
    const { chainId, transports, poolSize } = this.#config;

    return {
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
      poolSize,
    };
  }

  async #ensurePool(): Promise<NodeWorkerPool> {
    if (!this.#initPromise) {
      this.#initPromise = this.#initPool().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  async #initPool(): Promise<NodeWorkerPool> {
    const poolConfig = this.#getPoolConfig();
    this.#pool = new NodeWorkerPool(poolConfig);
    await this.#pool.initPool();
    return this.#pool;
  }

  terminate(): void {
    if (this.#pool) {
      this.#pool.terminate();
      this.#pool = null;
      this.#initPromise = null;
    }
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
    contractAddresses: Hex[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    const pool = await this.#ensurePool();
    const result = await pool.createEIP712(
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    );

    return {
      domain: {
        name: result.domain.name,
        version: result.domain.version,
        chainId: result.domain.chainId,
        verifyingContract: result.domain.verifyingContract,
      },
      types: {
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
    const pool = await this.#ensurePool();
    const result = await pool.encrypt(params.values, params.contractAddress, params.userAddress);

    return {
      handles: result.handles,
      inputProof: result.inputProof,
    };
  }

  async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
    const pool = await this.#ensurePool();
    const result = await pool.userDecrypt(
      params.handles,
      params.contractAddress,
      params.signedContractAddresses,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.signerAddress,
      params.startTimestamp,
      params.durationDays,
    );

    return result.clearValues;
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
    const pool = await this.#ensurePool();
    const result = await pool.publicDecrypt(handles);

    return {
      clearValues: result.clearValues,
      abiEncodedClearValues: result.abiEncodedClearValues,
      decryptionProof: result.decryptionProof,
    };
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Hex[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const pool = await this.#ensurePool();
    return pool.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
    const pool = await this.#ensurePool();
    const result = await pool.delegatedUserDecrypt(
      params.handles,
      params.contractAddress,
      params.signedContractAddresses,
      params.privateKey,
      params.publicKey,
      params.signature,
      params.delegatorAddress,
      params.delegateAddress,
      params.startTimestamp,
      params.durationDays,
    );

    return result.clearValues;
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    const pool = await this.#ensurePool();
    return pool.requestZKProofVerification(zkProof);
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
