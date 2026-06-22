/**
 * Browser transport for `@zama-fhe/sdk` — provides the {@link web} factory
 * that creates {@link RelayerWeb} instances backed by a Web Worker + WASM.
 *
 * Import from `@zama-fhe/sdk/web` to keep browser-only dependencies
 * (`self`, Web Worker, `?iife` bundle) out of Node.js entry points.
 *
 * @packageDocumentation
 */

export { web } from "../config/web";
export type { WebRelayerConfig, WebRelayerOptions } from "../config/types";
