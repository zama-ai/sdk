/**
 * React Native SDK for Zama confidential token operations.
 *
 * Provides `RelayerNative` (native FHE crypto via ARM binaries) and
 * `AsyncStorageAdapter` (persistent credential storage).
 * All hooks and providers are re-exported from `@zama-fhe/react-sdk`.
 *
 * @packageDocumentation
 */

// React Native specific
export { RelayerNative, type RelayerNativeConfig } from "./relayer-native";
// `SecureStoreAdapter` (durable `storage` slot — iOS Keychain / Android Keystore).
export { SecureStoreAdapter } from "./secure-store-adapter";
// `SqliteKvStoreAdapter` (ephemeral `sessionStorage` slot — SQLite-backed KV).
export { SqliteKvStoreAdapter } from "./sqlite-kv-store-adapter";
