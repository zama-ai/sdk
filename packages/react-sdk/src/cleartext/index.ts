/**
 * Cleartext backend re-exports for `@zama-fhe/react-sdk/cleartext`.
 *
 * Provides {@link RelayerCleartext} for development and testing
 * without WASM or FHE infrastructure.
 *
 * @packageDocumentation
 */

export { RelayerCleartext, HoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
export type { RelayerCleartextConfig, CleartextTransportConfig } from "@zama-fhe/sdk/cleartext";
