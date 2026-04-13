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
export { RelayerNative } from "./relayer-native";
// `SecureStoreAdapter` (durable `storage` slot — iOS Keychain / Android Keystore).
export { SecureStoreAdapter } from "./secure-store-adapter";
// `SqliteKvStoreAdapter` (ephemeral `sessionStorage` slot — SQLite-backed KV).
export { SqliteKvStoreAdapter } from "./sqlite-kv-store-adapter";

// Network presets needed to construct `RelayerNative`. Re-exported here so
// consumers don't need to depend on `@fhevm/react-native-sdk` directly (it
// ships as a local tarball).
export { SepoliaConfig, MainnetConfig } from "@fhevm/react-native-sdk";
