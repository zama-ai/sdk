/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultClient, type VaultClient } from "./client";
export {
  defineVault,
  defineVaultGroup,
  MAX_GROUP_VAULTS,
  type BatcherHistory,
  type RetiredBatcher,
  type Vault,
  type VaultGroup,
  type VaultIdOf,
} from "./config";
export type {
  Batch,
  BatchAction,
  BatchRef,
  BatchState,
  BatcherRef,
  Call,
  GroupJoinInput,
  GroupJoinOptions,
  OperatorApprovalCall,
  JoinCall,
  JoinDirection,
  JoinInput,
  JoinOptions,
  JoinOutcome,
  JoinRoute,
  OpenBatch,
  PreparedFinalize,
  PreparedJoin,
  SendJoinOptions,
  VaultCall,
  VaultLeg,
} from "./types";

export * from "./query";
