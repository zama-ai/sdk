/**
 * Browser transport for `@zama-fhe/sdk` — provides the {@link web} factory
 * that drives `@fhevm/sdk` on the calling thread.
 *
 * Import from `@zama-fhe/sdk/web` to keep browser-only dependencies out of
 * Node.js entry points.
 *
 * @packageDocumentation
 */

export { web } from "../config/web";
export type { WebRelayerConfig, RelayerConfig } from "../config/types";

export type { FheChain, FheChainAuth } from "../chains/types";
export type {
  FhevmRelayerSDK,
  RelayerOptions,
  FhevmClient,
  FhevmRelayerOptions,
  FhevmClientOptions,
  FhevmRuntimeConfig,
} from "../relayer/types";
