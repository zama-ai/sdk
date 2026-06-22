import { z } from "zod/mini";
import type { RelayerConfig } from "../config/types";
import type { LoggerService } from "../services/logger-service";
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
}

/** Node transport — narrows worker type to `NodeWorkerPool`. */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createWorker: (chains: FheChain[], logger: LoggerService) => NodeWorkerPool;
  readonly createRelayer: (
    chain: FheChain,
    worker: NodeWorkerPool,
    logger: LoggerService,
  ) => RelayerNode;
}

const NodePoolOptionsSchema = z.object({
  poolSize: z.optional(z.int().check(z.positive())),
  fheArtifactCacheTTL: z.optional(z.int().check(z.nonnegative())),
});

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @param options - Pool options (poolSize, logger, fheArtifactStorage, fheArtifactCacheTTL).
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node(),
 *   [mainnet.id]: node({ poolSize: 4 }),
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
