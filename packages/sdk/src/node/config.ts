import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { FhevmClientOptions } from "../relayer/types";

/** Node transport — drives the FHE backend directly on the calling thread. */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createRelayer: (chain: FheChain) => FhevmRelayer;
}

/**
 * Node.js transport — drives `@fhevm/sdk` via {@link FhevmRelayer} on the calling thread.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node(),
 *   [mainnet.id]: node(),
 * }
 * ```
 */
export function node(options?: FhevmClientOptions): NodeRelayerConfig {
  return { type: "node", createRelayer: (chain) => new FhevmRelayer({ chain, options }) };
}
