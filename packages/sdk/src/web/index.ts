/**
 * Browser transport for `@zama-fhe/sdk` — provides the {@link web} factory
 * that drives `@fhevm/sdk`, offloading encryption to a Web Worker by default.
 *
 * Import from `@zama-fhe/sdk/web` to keep browser-only dependencies out of
 * Node.js entry points.
 *
 * @packageDocumentation
 */

export { web, type WebRelayerOptions } from "../config/web";
export type { EncryptWorkerTimeouts } from "../worker/encrypt-worker-client";
export type { WebRelayerConfig, RelayerConfig } from "../config/types";
export type {
  RelayerOptions,
  FhevmRelayerOptions,
  FhevmClientOptions,
  FhevmRuntimeConfig,
} from "../relayer/types";
