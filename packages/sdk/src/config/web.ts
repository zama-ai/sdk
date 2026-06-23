import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { FhevmRuntimeConfig } from "../relayer/relayer-sdk.types";
import type { WebRelayerConfig } from "./types";

/**
 * Browser relayer — drives `@fhevm/sdk` via {@link FhevmRelayer}.
 *
 * @param runtime - Global `@fhevm/sdk` runtime config (WASM load mode, threads,
 *   logger, auth). Applied once per process when the client first initializes.
 *   Per-chain `auth` from the chain definition is merged in by {@link FhevmRelayer}.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web(),
 *   [mainnet.id]: web(),
 * }
 * ```
 */
export function web(runtime: FhevmRuntimeConfig = {}): WebRelayerConfig {
  return {
    type: "web",
    createRelayer: (chain) => new FhevmRelayer({ chain, runtime }),
  };
}
