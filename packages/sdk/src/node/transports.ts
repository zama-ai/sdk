import type { TransportConfig } from "../config/transports";
import { RelayerNode } from "../relayer/relayer-node";
import type { RelayerChainConfig } from "../chains/types";
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
export interface NodeTransportConfig extends TransportConfig {
  readonly type: "node";
  readonly createWorker: (chains: RelayerChainConfig[]) => NodeWorkerPool;
  readonly createRelayer: (chain: RelayerChainConfig, worker: NodeWorkerPool) => RelayerNode;
}

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @param chain - Per-chain FHE instance overrides (e.g. `relayerUrl`).
 * @param options - Pool options (poolSize, logger, fheArtifactStorage, fheArtifactCacheTTL).
 *
 * @example
 * ```ts
 * transports: {
 *   [sepolia.id]: node({ relayerUrl: "/api/sepolia" }, { poolSize: 4 }),
 *   [mainnet.id]: node({ relayerUrl: "/api/mainnet" }),
 * }
 * ```
 */
export function node(
  chain?: Partial<RelayerChainConfig>,
  options?: NodePoolOptions,
): NodeTransportConfig {
  return {
    type: "node",
    chain,
    createWorker: (chains) =>
      new NodeWorkerPool({
        chains,
        poolSize: options?.poolSize,
        logger: options?.logger,
      }),
    createRelayer: (resolvedChain, worker) => {
      assertCondition(
        !!worker,
        "node() transport requires a worker pool — createWorker must be called first.",
      );
      return new RelayerNode({
        chain: resolvedChain,
        pool: worker,
        logger: options?.logger,
        fheArtifactStorage: options?.fheArtifactStorage,
        fheArtifactCacheTTL: options?.fheArtifactCacheTTL,
      });
    },
  };
}
