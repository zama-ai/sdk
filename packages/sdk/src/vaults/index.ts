/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export {
  createVaultClient,
  VaultClient,
  type VaultJoinParams,
  type VaultPosition,
  type VaultRecord,
} from "./client";
export {
  defineVaults,
  type BatcherHistory,
  MAX_GROUP_VAULTS,
  type GroupId,
  type VaultConfig,
  type VaultGroupConfig,
  type VaultId,
  type VaultsConfig,
} from "./config";
export type {
  ActionOutcome,
  BatchState,
  Direction,
  JoinLeg,
  JoinOptions,
  JoinOutcome,
  JoinRecord,
  Leg,
  OpenBatch,
  Position,
  PositionPhase,
  PrepareJoinOptions,
  PreparedVaultAction,
  VaultAction,
  VaultCall,
  VaultCheck,
} from "./types";

// Importing this barrel does not require TanStack Query to be installed: the
// TanStack types below are type-only imports, erased at compile time.
export * from "./query";
