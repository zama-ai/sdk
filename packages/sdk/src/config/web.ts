import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";
import type { WebRelayerConfig } from "./types";

/**
 * Browser relayer — drives `@fhevm/sdk` via {@link FhevmRelayer}.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web({ timeout: 5 * 60_000 }),
 *   [mainnet.id]: web({ batchRpcCalls: true }),
 * }
 * ```
 */
export function web(options?: RelayerOptions): WebRelayerConfig {
  return { type: "web", createRelayer: (chain) => new FhevmRelayer({ chain, options }) };
}
