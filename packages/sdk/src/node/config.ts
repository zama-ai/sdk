import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";

/**
 * Node transport config. `createRelayer` is an internal self-registration
 * hook (see `RelayerConfig`) — `FhevmRelayer` is an implementation detail,
 * not part of the public API, so this deliberately doesn't narrow its type
 * beyond the base (mirrors `WebRelayerConfig`/`CleartextRelayerConfig`).
 */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
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
  return { type: "node", createRelayer: (chain) => new FhevmRelayer({ chain, options }) };
}
