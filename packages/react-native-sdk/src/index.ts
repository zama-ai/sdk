/**
 * React Native SDK for Zama confidential token operations.
 *
 * Exposes three platform-specific primitives consumed by `ZamaProvider`:
 * - `RelayerNative` — native FHE crypto backed by the Rust engine.
 * - `SecureStoreAdapter` — durable `storage` slot (iOS Keychain / Android Keystore).
 * - `SqliteKvStoreAdapter` — SQLite-backed KV. Default `fheArtifactStorage` for
 *   `RelayerNative`, and a suitable choice for the SDK's `sessionStorage` slot.
 *
 * All React hooks (`useEncrypt`, `useShield`, etc.) come from
 * `@zama-fhe/react-sdk` and work unchanged on top of these adapters.
 *
 * @packageDocumentation
 */

// React Native specific
export { RelayerNative, type RelayerNativeConfig } from "./relayer-native";
// `SecureStoreAdapter` (durable `storage` slot — iOS Keychain / Android Keystore).
export { SecureStoreAdapter } from "./secure-store-adapter";
// `SqliteKvStoreAdapter` (ephemeral `sessionStorage` slot — SQLite-backed KV).
export { SqliteKvStoreAdapter } from "./sqlite-kv-store-adapter";
