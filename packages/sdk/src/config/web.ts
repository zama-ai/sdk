import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { FhevmClientOptions } from "../relayer/types";
import type { WebRelayerConfig } from "./types";

/**
 * Browser relayer — drives `@fhevm/sdk` via {@link FhevmRelayer}.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web(),
 *   [mainnet.id]: web(),
 * }
 * ```
 */
export function web(options?: FhevmClientOptions): WebRelayerConfig {
  return { type: "web", createRelayer: (chain) => new FhevmRelayer({ chain, options }) };
}
