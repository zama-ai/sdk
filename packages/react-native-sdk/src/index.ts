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
