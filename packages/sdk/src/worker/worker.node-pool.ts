import { availableParallelism } from "node:os";
import type { RelayerChainConfig } from "../chains/types";
import { NodeWorkerClient } from "./worker.node-client";
import type { NodeWorkerClientConfig } from "./worker.node-client";
import type {
  CreateDelegatedEIP712Payload,
  CreateDelegatedEIP712ResponseData,
  CreateEIP712Payload,
  CreateEIP712ResponseData,
  DelegatedUserDecryptPayload,
  DelegatedUserDecryptResponseData,
  EncryptPayload,
  EncryptResponseData,
  GenerateKeypairRequest,
  GenerateKeypairResponseData,
  GetPublicKeyRequest,
  GetPublicKeyResponseData,
  GetPublicParamsRequest,
  GetPublicParamsResponseData,
  PublicDecryptPayload,
  PublicDecryptResponseData,
  RequestZKProofVerificationRequest,
  RequestZKProofVerificationResponseData,
  UserDecryptPayload,
  UserDecryptResponseData,
} from "./worker.types";

export interface NodeWorkerPoolConfig extends NodeWorkerClientConfig {
  poolSize?: number;
}

const MAX_DEFAULT_POOL_SIZE = 4;

/**
 * Pool of Node.js worker threads for parallel FHE operations.
 *
 * **Default pool size:** `min(os.availableParallelism(), 4)`. Each worker loads
 * the full WASM module (~50–100 MB), so size the pool based on available memory.
 *
 * **Scheduling:** Least-connections — each request is dispatched to the worker
 * with the fewest in-flight operations.
 *
 * **When to override pool size:**
 * - High-throughput batch processing (e.g. bulk encryptions): increase to match CPU cores.
 * - Memory-constrained environments: decrease to 1–2 workers.
 *
 * **Lifecycle:**
 * 1. Construct with config: `new NodeWorkerPool({ fhevmConfig })`
 * 2. Initialize all workers: `await pool.initPool()`
 * 3. Use: `await pool.encrypt(...)`, `await pool.userDecrypt(...)`, etc.
 * 4. Shut down: `pool.terminate()`
 *
 * `initPool()` is idempotent — concurrent calls share the same initialization promise.
 * If any worker fails to initialize, all workers are terminated and the error is propagated.
 */
export class NodeWorkerPool {
  readonly #workers: NodeWorkerClient[] = [];
  readonly #activeCount: number[] = [];
  readonly #config: NodeWorkerPoolConfig;
  readonly #poolSize: number;
  #initPromise: Promise<void> | null = null;

  /**
   * @param config - Pool configuration. Set `poolSize` to override the default
   *   (`min(os.availableParallelism(), 4)`).
   */
  constructor(config: NodeWorkerPoolConfig) {
    this.#config = config;
    this.#poolSize = config.poolSize ?? Math.min(availableParallelism(), MAX_DEFAULT_POOL_SIZE);
  }

  get poolSize(): number {
    return this.#poolSize;
  }

  async initPool(): Promise<void> {
    if (this.#workers.length > 0) {
      return;
    }
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
    const errors: Error[] = [];
    for (const worker of this.#workers) {
      try {
        worker.terminate();
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
      }
    }
    this.#workers.length = 0;
    this.#activeCount.length = 0;
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to terminate worker pool");
    }
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

  async generateKeypair(
    params: GenerateKeypairRequest["payload"],
  ): Promise<GenerateKeypairResponseData> {
    return this.#dispatch((w) => w.generateKeypair(params));
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

  async publicDecrypt(params: PublicDecryptPayload): Promise<PublicDecryptResponseData> {
    return this.#dispatch((w) => w.publicDecrypt(params));
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
    params: RequestZKProofVerificationRequest["payload"],
  ): Promise<RequestZKProofVerificationResponseData> {
    return this.#dispatch((w) => w.requestZKProofVerification(params));
  }

  async getPublicKey(params: GetPublicKeyRequest["payload"]): Promise<GetPublicKeyResponseData> {
    return this.#dispatch((w) => w.getPublicKey(params));
  }

  async getPublicParams(
    params: GetPublicParamsRequest["payload"],
  ): Promise<GetPublicParamsResponseData> {
    return this.#dispatch((w) => w.getPublicParams(params));
  }

  async addChain(config: RelayerChainConfig): Promise<void> {
    if (this.#workers.length === 0) {
      throw new Error("NodeWorkerPool not initialized. Call initPool() first.");
    }
    await Promise.all(this.#workers.map((w) => w.addChain(config)));
  }

  async removeChain(chainId: number): Promise<void> {
    if (this.#workers.length === 0) {
      throw new Error("NodeWorkerPool not initialized. Call initPool() first.");
    }
    await Promise.all(this.#workers.map((w) => w.removeChain(chainId)));
  }
}
