import { z } from "zod";
import type { RelayerConfig } from "../config/types";
import { RelayerNode } from "../relayer/relayer-node";
import type { FheChain } from "../chains/types";
import type { GenericStorage } from "../types";
import { NodeWorkerPool } from "../worker/worker.node-pool";
import type { GenericLogger } from "../worker/worker.types";
import { assertCondition } from "../utils";

/** Pool options for the `node()` transport factory. */
export interface NodePoolOptions {
  poolSize?: number;
  logger?: GenericLogger;
  fheArtifactStorage?: GenericStorage;
  fheArtifactCacheTTL?: number;
}

/** Node transport — narrows worker type to `NodeWorkerPool`. */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createWorker: (chains: FheChain[]) => NodeWorkerPool;
  readonly createRelayer: (chain: FheChain, worker: NodeWorkerPool) => RelayerNode;
}

const NodePoolOptionsSchema = z.object({
  poolSize: z.number().int().positive().optional(),
  fheArtifactCacheTTL: z.number().int().nonnegative().optional(),
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
    NodePoolOptionsSchema.parse(options);
  }
  return {
    type: "node",
    createWorker: (chains) => new NodeWorkerPool({ chains, ...options }),
    createRelayer: (chain, pool) => {
      assertCondition(
        !!pool,
        "node() relayer requires a worker pool — createWorker must be called first.",
      );
      return new RelayerNode({ chain, pool, ...options });
    },
  };
}
