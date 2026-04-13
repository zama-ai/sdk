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
export { AsyncStorageAdapter } from "./async-storage-adapter";

// Network presets needed to construct `RelayerNative`. Re-exported here so
// consumers don't need to depend on `@fhevm/react-native-sdk` directly (it
// ships as a local tarball).
export { SepoliaConfig, MainnetConfig } from "@fhevm/react-native-sdk";
