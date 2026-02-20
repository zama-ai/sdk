import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node";
import type { RelayerSDK } from "./relayer-sdk";
import { mergeFhevmConfig } from "./relayer-utils";
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
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";
import {
  NodeWorkerClient,
  type NodeWorkerClientConfig,
} from "../worker/worker.node-client";

export interface RelayerNodeConfig {
  chainId: number;
  transports: Record<number, Partial<FhevmInstanceConfig>>;
}

/**
 * RelayerNode — Node.js FHE backend using a worker thread.
 * Offloads CPU-intensive WASM/FHE operations to a node:worker_threads worker.
 */
export class RelayerNode implements RelayerSDK {
  readonly #config: RelayerNodeConfig;
  #workerClient: NodeWorkerClient | null = null;
  #initPromise: Promise<NodeWorkerClient> | null = null;

  constructor(config: RelayerNodeConfig) {
    this.#config = config;
  }

  #getWorkerConfig(): NodeWorkerClientConfig {
    const { chainId, transports } = this.#config;

    return {
      fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
    };
  }

  async #ensureWorker(): Promise<NodeWorkerClient> {
    if (!this.#initPromise) {
      this.#initPromise = this.#initWorker().catch((error) => {
        this.#initPromise = null;
        throw error;
      });
    }
    return this.#initPromise;
  }

  async #initWorker(): Promise<NodeWorkerClient> {
    const workerConfig = this.#getWorkerConfig();
    this.#workerClient = new NodeWorkerClient(workerConfig);
    await this.#workerClient.initWorker();
    return this.#workerClient;
  }

  terminate(): void {
    if (this.#workerClient) {
      this.#workerClient.terminate();
      this.#workerClient = null;
      this.#initPromise = null;
    }
  }

  async generateKeypair(): Promise<FHEKeypair> {
    const worker = await this.#ensureWorker();
    const result = await worker.generateKeypair();
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
    const worker = await this.#ensureWorker();
    const result = await worker.createEIP712(
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
        UserDecryptRequestVerification:
          result.types.UserDecryptRequestVerification,
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
    const worker = await this.#ensureWorker();
    const result = await worker.encrypt(
      params.values,
      params.contractAddress,
      params.userAddress,
    );

    return {
      handles: result.handles,
      inputProof: result.inputProof,
    };
  }

  async userDecrypt(
    params: UserDecryptParams,
  ): Promise<Record<string, bigint>> {
    const worker = await this.#ensureWorker();
    const result = await worker.userDecrypt(
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
    const worker = await this.#ensureWorker();
    const result = await worker.publicDecrypt(handles);

    return {
      clearValues: result.clearValues,
      abiEncodedClearValues: result.abiEncodedClearValues,
      decryptionProof: result.decryptionProof,
    };
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    const worker = await this.#ensureWorker();
    return worker.createDelegatedUserDecryptEIP712(
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Record<string, bigint>> {
    const worker = await this.#ensureWorker();
    const result = await worker.delegatedUserDecrypt(
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

  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<InputProofBytesType> {
    const worker = await this.#ensureWorker();
    return worker.requestZKProofVerification(zkProof);
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicKey()).result;
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    const worker = await this.#ensureWorker();
    return (await worker.getPublicParams(bits)).result;
  }
}
