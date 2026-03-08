import { Effect, Layer } from "effect";
import type {
  ClearValueType,
  FhevmInstanceConfig,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/node";
import type { RelayerSDK } from "./relayer-sdk";
import { mergeFhevmConfig } from "./relayer-utils";
import { ZamaError, EncryptionFailedError } from "../token/errors";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
} from "./relayer-sdk.types";
import { NodeWorkerPool, type NodeWorkerPoolConfig } from "../worker/worker.node-pool";
import { Relayer } from "../services/Relayer";
import { buildRelayerService } from "./relayer-service";

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
  #layer: Layer.Layer<Relayer> | null = null;
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
      this.#layer = null;
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

  /** Run an Effect program against the Relayer service backed by the current pool. */
  async #runEffect<A, E>(effect: Effect.Effect<A, E, Relayer>): Promise<A> {
    const pool = await this.#ensurePool();
    if (!this.#layer) {
      this.#layer = Layer.succeed(Relayer, buildRelayerService(pool));
    }
    return Effect.runPromise(effect.pipe(Effect.provide(this.#layer)));
  }

  terminate(): void {
    this.#terminated = true;
    if (this.#pool) {
      this.#pool.terminate();
      this.#pool = null;
    }
    this.#layer = null;
    this.#initPromise = null;
    this.#ensureLock = null;
  }

  async generateKeypair(): Promise<KeypairType<string>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.generateKeypair()));
  }

  async createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<EIP712TypedData> {
    return this.#runEffect(
      Effect.flatMap(Relayer, (r) =>
        r.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
      ),
    );
  }

  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.encrypt(params)));
  }

  async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.userDecrypt(params)));
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.publicDecrypt(handles)));
  }

  async createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number = 7,
  ): Promise<KmsDelegatedUserDecryptEIP712Type> {
    return this.#runEffect(
      Effect.flatMap(Relayer, (r) =>
        r.createDelegatedUserDecryptEIP712(
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp,
          durationDays,
        ),
      ),
    );
  }

  async delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.delegatedUserDecrypt(params)));
  }

  async requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.requestZKProofVerification(zkProof)));
  }

  async getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.getPublicKey()));
  }

  async getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null> {
    return this.#runEffect(Effect.flatMap(Relayer, (r) => r.getPublicParams(bits)));
  }
}
