import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";
import type { LoggerService } from "../services/logger-service";

/** Node transport — drives the FHE backend directly on the calling thread. */
export interface NodeRelayerConfig extends RelayerConfig {
  /** Discriminant for the node transport. */
  readonly type: "node";
  /** @internal */
  readonly createRelayer: (chain: FheChain, logger: LoggerService) => FhevmRelayer;
}

/**
 * Node.js transport — drives `@fhevm/sdk` via {@link FhevmRelayer} on the calling thread.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node({ timeout: 5 * 60_000 }),
 *   [mainnet.id]: node({ batchRpcCalls: true }),
 * }
 * ```
 */
export function node(options?: RelayerOptions): NodeRelayerConfig {
  return {
    type: "node",
    createRelayer: (chain, logger) => new FhevmRelayer({ chain, options, logger }),
  };
}
