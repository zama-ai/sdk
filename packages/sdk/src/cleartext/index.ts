/**
 * Cleartext backend for `@zama-fhe/sdk` — provides {@link RelayerCleartext}
 * for development and testing without WASM or FHE infrastructure.
 *
 * @packageDocumentation
 */

export { RelayerCleartext } from "../relayer/relayer-cleartext";
export type { RelayerCleartextConfig } from "../relayer/relayer-cleartext";
export { createCleartextInstance } from "./cleartext-instance";
export { CleartextExecutor } from "./cleartext-executor";
export type { CleartextInstanceConfig } from "./types";
