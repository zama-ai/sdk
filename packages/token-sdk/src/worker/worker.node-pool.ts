import { availableParallelism } from "node:os";
import { NodeWorkerClient } from "./worker.node-client";
import type { NodeWorkerClientConfig } from "./worker.node-client";
import type { ZKProofLike } from "../relayer/relayer-sdk.types";
import type {
  CreateDelegatedEIP712Payload,
  CreateDelegatedEIP712ResponseData,
  CreateEIP712Payload,
  CreateEIP712ResponseData,
  DelegatedUserDecryptPayload,
  DelegatedUserDecryptResponseData,
  EncryptPayload,
  EncryptResponseData,
  GenerateKeypairResponseData,
  GetPublicKeyResponseData,
  GetPublicParamsResponseData,
  PublicDecryptResponseData,
  RequestZKProofVerificationResponseData,
  UserDecryptPayload,
  UserDecryptResponseData,
} from "./worker.types";

export interface NodeWorkerPoolConfig extends NodeWorkerClientConfig {
  poolSize?: number;
}

const MAX_DEFAULT_POOL_SIZE = 4;

export class NodeWorkerPool {
  readonly #workers: NodeWorkerClient[] = [];
  readonly #activeCount: number[] = [];
  readonly #config: NodeWorkerPoolConfig;
  readonly #poolSize: number;
  #initPromise: Promise<void> | null = null;

  constructor(config: NodeWorkerPoolConfig) {
    this.#config = config;
    this.#poolSize = config.poolSize ?? Math.min(availableParallelism(), MAX_DEFAULT_POOL_SIZE);
  }

  get poolSize(): number {
    return this.#poolSize;
  }

  async initPool(): Promise<void> {
    if (this.#workers.length > 0) return;
    if (!this.#initPromise) {
      this.#initPromise = this.#doInitPool().finally(() => {
        this.#initPromise = null;
      });
    }
    return this.#initPromise;
  }

  async #doInitPool(): Promise<void> {
    for (let i = 0; i < this.#poolSize; i++) {
      this.#workers.push(new NodeWorkerClient(this.#config));
      this.#activeCount.push(0);
    }
    try {
      await Promise.all(this.#workers.map((w) => w.initWorker()));
    } catch (error) {
      // Terminate any workers that did initialize and reset state
      for (const worker of this.#workers) {
        worker.terminate();
      }
      this.#workers.length = 0;
      this.#activeCount.length = 0;
      throw error;
    }
  }

  terminate(): void {
    for (const worker of this.#workers) {
      worker.terminate();
    }
    this.#workers.length = 0;
    this.#activeCount.length = 0;
  }

  /**
   * Pick the worker with the fewest in-flight requests (least-connections).
   * Returns the index so #dispatch can track the active count.
   */
  #leastBusyIndex(): number {
    let minIndex = 0;
    let minCount = this.#activeCount[0]!;
    for (let i = 1; i < this.#activeCount.length; i++) {
      if (this.#activeCount[i]! < minCount) {
        minCount = this.#activeCount[i]!;
        minIndex = i;
      }
    }
    return minIndex;
  }

  async #dispatch<T>(fn: (worker: NodeWorkerClient) => Promise<T>): Promise<T> {
    if (this.#workers.length === 0) {
      throw new Error("NodeWorkerPool not initialized. Call initPool() first.");
    }
    const index = this.#leastBusyIndex();
    this.#activeCount[index]!++;
    try {
      return await fn(this.#workers[index]!);
    } finally {
      this.#activeCount[index]!--;
    }
  }

  async generateKeypair(): Promise<GenerateKeypairResponseData> {
    return this.#dispatch((w) => w.generateKeypair());
  }

  async createEIP712(params: CreateEIP712Payload): Promise<CreateEIP712ResponseData> {
    return this.#dispatch((w) => w.createEIP712(params));
  }

  async encrypt(params: EncryptPayload): Promise<EncryptResponseData> {
    return this.#dispatch((w) => w.encrypt(params));
  }

  async userDecrypt(params: UserDecryptPayload): Promise<UserDecryptResponseData> {
    return this.#dispatch((w) => w.userDecrypt(params));
  }

  async publicDecrypt(handles: string[]): Promise<PublicDecryptResponseData> {
    return this.#dispatch((w) => w.publicDecrypt(handles));
  }

  async createDelegatedUserDecryptEIP712(
    params: CreateDelegatedEIP712Payload,
  ): Promise<CreateDelegatedEIP712ResponseData> {
    return this.#dispatch((w) => w.createDelegatedUserDecryptEIP712(params));
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptPayload,
  ): Promise<DelegatedUserDecryptResponseData> {
    return this.#dispatch((w) => w.delegatedUserDecrypt(params));
  }

  async requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.#dispatch((w) => w.requestZKProofVerification(zkProof));
  }

  async getPublicKey(): Promise<GetPublicKeyResponseData> {
    return this.#dispatch((w) => w.getPublicKey());
  }

  async getPublicParams(bits: number): Promise<GetPublicParamsResponseData> {
    return this.#dispatch((w) => w.getPublicParams(bits));
  }
}
