import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerSDK } from "../relayer/types";

/** Node transport — drives the FHE backend directly (no worker pool). */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createRelayer: (chain: FheChain) => RelayerSDK;
}

/**
 * Node.js transport — drives `@fhevm/sdk` via {@link RelayerSDK} on the calling thread.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node(),
 *   [mainnet.id]: node(),
 * }
 * ```
 */
export function node(): NodeRelayerConfig {
  return {
    type: "node",
    createRelayer: (chain) => new FhevmRelayer({ chain }),
  };
}
