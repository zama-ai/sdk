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

// Re-export native SDK essentials
export { createInstance, SepoliaConfig, MainnetConfig } from "@fhevm/react-native-sdk";

// Re-export everything from react-sdk (provider, hooks, types, utilities)
export * from "@zama-fhe/react-sdk";
