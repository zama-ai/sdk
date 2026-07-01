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
export type { RelayerConfig } from "../config/types";
export type { FhevmRelayerSDK as RelayerSDK } from "../relayer/types";
export type { GenericLogger } from "../types/logger";

// Relayer types used in RelayerNode's public API
export type { ClearValue, EIP712TypedData, EncryptParameters } from "../relayer/types";
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
