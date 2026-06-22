/**
 * Node.js backend for `@zama-fhe/sdk` — provides the `node()` transport
 * factory for server-side FHE operations.
 *
 * The `node()` transport factory self-registers its handler on first call,
 * keeping `node:worker_threads` out of browser bundles.
 *
 * @packageDocumentation
 */

export { node } from "./config";
export type { NodeRelayerConfig } from "./config";
export { cleartext } from "../config/cleartext";
export type { RelayerConfig } from "../config/types";
export type { RelayerSDK } from "../relayer/relayer-sdk";
export type { GenericLogger } from "../types/logger";

// Relayer types used in RelayerNode's public API
export type {
  ClearValue,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
} from "../relayer/relayer-sdk.types";
// Decrypt parameter/result types — aligned with the canonical Zama glossary (see main entry).
export type {
  UserDecryptParams as DecryptValuesParams,
  PublicDecryptResult as DecryptPublicValuesResult,
  DelegatedUserDecryptParams as DelegatedDecryptValuesParams,
} from "../relayer/relayer-sdk.types";

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
