/**
 * React Native SDK for Zama confidential token operations.
 *
 * Exposes two platform-specific primitives consumed by `ZamaProvider`:
 * - `RelayerNative` — native FHE crypto backed by the Rust engine.
 * - `SqliteKvStoreAdapter` — SQLite-backed KV. Default `fheArtifactStorage`
 *   for `RelayerNative`, and the recommended backing for both `storage`
 *   and `sessionStorage` slots.
 *
 * All React hooks (`useEncrypt`, `useShield`, etc.) come from
 * `@zama-fhe/react-sdk` and work unchanged on top of these adapters.
 *
 * @packageDocumentation
 */

// React Native specific
export { RelayerNative, type RelayerNativeConfig } from "./relayer-native";
// `SqliteKvStoreAdapter` — SQLite-backed KV, suitable for `storage`,
// `sessionStorage`, and `fheArtifactStorage`.
export { SqliteKvStoreAdapter } from "./sqlite-kv-store-adapter";
