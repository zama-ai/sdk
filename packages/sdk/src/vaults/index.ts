/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultClient, VaultClient } from "./client";
export {
  batcherAddresses,
  defineVaultGroup,
  MAX_GROUP_VAULTS,
  type BatcherHistory,
  type RetiredBatcher,
  type VaultConfig,
  type VaultGroup,
  type VaultGroupConfig,
  type VaultGroupVault,
  type VaultIdOf,
} from "./config";
export type {
  ActiveBatchers,
  Batch,
  BatchAction,
  BatchRef,
  BatchState,
  Call,
  Direction,
  GrantCall,
  JoinCall,
  JoinInput,
  JoinOptions,
  JoinOutcome,
  JoinRoute,
  OpenBatch,
  PreparedFinalize,
  PreparedJoin,
  VaultCall,
  VaultCheck,
  VaultLeg,
  WalletMode,
} from "./types";

// Importing this barrel does not require TanStack Query to be installed: the
// TanStack types below are type-only imports, erased at compile time.
export * from "./query";
