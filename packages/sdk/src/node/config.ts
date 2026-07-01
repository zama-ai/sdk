import { z } from "zod/mini";
import type { RelayerConfig } from "../config/types";
import type { GenericLogger } from "../worker/worker.types";
import { RelayerNode } from "../relayer/relayer-node";
import type { FheChain } from "../chains/types";
import type { GenericStorage } from "../types";
import { parseConfiguration } from "../validation";
import { NodeWorkerPool } from "../worker/worker.node-pool";
import { assertCondition } from "../utils";

/**
 * Pool options for the `node()` transport factory.
 *
 * Logging is configured once, SDK-wide, via `createConfig({ logger })` — there
 * is deliberately no per-relayer logger option.
 */
export interface NodePoolOptions {
  poolSize?: number;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
  /**
   * Per-operation worker timeout in **seconds** (encrypt / decrypt / etc.).
   * Defaults to 30. A timed-out operation rejects with `WorkerTimeoutError` and
   * recycles the worker (see {@link recycleWorkerOnTimeout}).
   */
  operationTimeout?: number;
  /** WASM-init timeout in **seconds**. Defaults to 60. */
  initTimeout?: number;
  /**
   * Terminate + re-init the worker after an operation timeout so a hung thread
   * can't keep serving requests. Defaults to `true`. Note: a timeout caused by a
   * slow/down relayer (not a stuck thread) also recycles an otherwise-healthy
   * worker, paying a WASM re-init on the next call — when fronting a flaky
   * relayer, prefer `false` with a higher `operationTimeout`.
   */
  recycleWorkerOnTimeout?: boolean;
}

/** Node transport — narrows worker type to `NodeWorkerPool`. */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createWorker: (chains: FheChain[], logger: GenericLogger) => NodeWorkerPool;
  readonly createRelayer: (
    chain: FheChain,
    worker: NodeWorkerPool,
    logger: GenericLogger,
  ) => RelayerNode;
}

const NodePoolOptionsSchema = z.object({
  poolSize: z.optional(z.int().check(z.positive())),
  fheArtifactCacheTTL: z.optional(z.int().check(z.nonnegative())),
  operationTimeout: z.optional(z.int().check(z.positive())),
  initTimeout: z.optional(z.int().check(z.positive())),
  recycleWorkerOnTimeout: z.optional(z.boolean()),
});

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @param options - Pool options: `poolSize`, `fheArtifactStorage`,
 *   `fheArtifactCacheTTL`, and the worker-timeout knobs `operationTimeout` /
 *   `initTimeout` (seconds) and `recycleWorkerOnTimeout`.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node(),
 *   [mainnet.id]: node({ poolSize: 4, operationTimeout: 10 }),
 * }
 * ```
 */
export function node(options?: NodePoolOptions): NodeRelayerConfig {
  if (options !== undefined) {
    parseConfiguration(NodePoolOptionsSchema, options);
  }
  return {
    type: "node",
    createWorker: (chains, logger) => new NodeWorkerPool({ chains, ...options, logger }),
    createRelayer: (chain, pool, logger) => {
      assertCondition(
        !!pool,
        "node() relayer requires a worker pool — createWorker must be called first.",
      );
      return new RelayerNode({ chain, pool, ...options, logger });
    },
  };
}
