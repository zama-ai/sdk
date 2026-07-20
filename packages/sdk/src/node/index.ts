/**
 * Node.js backend for `@zama-fhe/sdk` — provides the `node()` transport
 * factory for server-side FHE operations.
 *
 * The `node()` transport drives `@fhevm/sdk` directly on the calling thread.
 *
 * @packageDocumentation
 */

export { node } from "./config";
export type { NodeRelayerConfig } from "./config";
export { cleartext } from "../config/cleartext";
export type { RelayerConfig, CleartextRelayerConfig } from "../config/types";
export type { FheChain } from "../chains/types";
export type { GenericLogger } from "../types/logger";
// Surfaced by the node entry's public API: `AsyncLocalMapStorage implements GenericStorage`,
// and the exported chain presets carry `auth?: FheChainAuth`.
export type { GenericStorage } from "../types/storage";
export type { FheChainAuth } from "../chains/types";

// Relayer types used in the node transport's public API
export type {
  ClearValue,
  EIP712TypedData,
  EncryptParams,
  EncryptInput,
  EncryptedValue,
  RelayerOptions,
  FhevmRelayerOptions,
  FhevmClientOptions,
  FhevmRuntimeConfig,
} from "../relayer/types";
// Decrypt parameter/result types — aligned with the canonical Zama glossary (see main entry).
export type { DecryptPublicValuesResult } from "../relayer/types";

// Storage
export { asyncLocalStorage, AsyncLocalMapStorage } from "../storage/async-local-storage";

// Chain presets
export {
  mainnet,
  sepolia,
  hoodi,
  ingenTestnet,
  bscTestnet,
  hardhat,
  anvil,
  chains,
} from "../chains";
