import { FhevmRelayer } from "../relayer/fhevm-relayer";
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
export function web(): WebRelayerConfig {
  return { type: "web", createRelayer: (chain) => new FhevmRelayer({ chain }) };
}
