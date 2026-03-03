/**
 * Cleartext backend for `@zama-fhe/sdk` — provides {@link RelayerCleartext}
 * for development and testing without WASM or FHE infrastructure.
 *
 * @packageDocumentation
 */

export { RelayerCleartext, HoodiCleartextConfig } from "../relayer/relayer-cleartext";
export type {
  RelayerCleartextConfig,
  CleartextTransportConfig,
} from "../relayer/relayer-cleartext";
