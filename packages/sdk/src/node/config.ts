import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { FhevmRuntimeConfig, RelayerSDK } from "../relayer/relayer-sdk.types";
import type { FheChain } from "../chains/types";

/** Node transport — drives the FHE backend directly (no worker pool). */
export interface NodeRelayerConfig extends RelayerConfig {
  readonly type: "node";
  readonly createRelayer: (chain: FheChain) => RelayerSDK;
}

/**
 * Node.js transport — drives `@fhevm/sdk` via {@link FhevmRelayer} on the calling thread.
 *
 * @param runtime - Global `@fhevm/sdk` runtime config (WASM load mode, threads,
 *   logger, auth). Applied once per process when the client first initializes.
 *   Per-chain `auth` from the chain definition is merged in by {@link FhevmRelayer}.
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node(),
 *   [mainnet.id]: node(),
 * }
 * ```
 */
export function node(runtime: FhevmRuntimeConfig = {}): NodeRelayerConfig {
  return {
    type: "node",
    createRelayer: (chain) => new FhevmRelayer({ chain, runtime }),
  };
}
