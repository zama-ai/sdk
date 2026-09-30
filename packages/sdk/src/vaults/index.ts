/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultBatcher, VaultBatcher } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export {
  createVaultGroup,
  VaultGroup,
  type VaultGroupConfig,
  type VaultGroupJoin,
  type VaultGroupRedeemOptions,
  type VaultGroupJoinResult,
  type VaultGroupMember,
  type VaultMemberConfig,
} from "./vault-group";
export { MAX_GROUP_VAULTS } from "./allocation";
export { BatchState } from "./types";
export type { JoinOptions, JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
export { decodeJoined, findJoined, VaultTopics, type JoinedEvent } from "./events";

export {
  batchCallbackDeadlineContract,
  batchCreatedAtContract,
  batchDispatchedAtContract,
  batchMinBatchAgeContract,
  batchStateContract,
  callbackDeadlineContract,
  claimContract,
  currentBatchIdContract,
  depositsContract,
  dispatchBatchContract,
  exchangeRateContract,
  exchangeRateDecimalsContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  pausedContract,
  quitContract,
  recoverContract,
  toTokenContract,
  totalDepositsContract,
  vaultContract,
} from "./contracts";

// Importing this barrel does not require TanStack Query to be installed: the
// TanStack types below are type-only imports, erased at compile time.
export {
  batchStateQueryOptions,
  claimMutationOptions,
  currentBatchIdQueryOptions,
  depositMutationOptions,
  dispatchBatchMutationOptions,
  groupDepositMutationOptions,
  groupRedeemMutationOptions,
  invalidateAfterClaim,
  invalidateAfterDispatchBatch,
  invalidateAfterJoin,
  invalidateAfterQuit,
  invalidateBatchQueries,
  joinMutationOptions,
  quitMutationOptions,
  recoverMutationOptions,
  redeemMutationOptions,
  timeUntilDispatchableQueryOptions,
  vaultQueryKeys,
  type BatchStateQueryConfig,
  type ClaimParams,
  type CurrentBatchIdQueryConfig,
  type DepositParams,
  type GroupDepositParams,
  type GroupRedeemParams,
  type JoinParams,
  type QuitParams,
  type RecoverParams,
  type RedeemParams,
  type TimeUntilDispatchableQueryConfig,
} from "./query";
