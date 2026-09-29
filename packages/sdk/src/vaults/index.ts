/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultBatcher, VaultBatcher } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export { createVaultRouter, VaultRouter, type VaultRouterJoinOptions } from "./vault-router";
export {
  createVaultGroup,
  VaultGroup,
  type VaultGroupConfig,
  type VaultGroupJoin,
  type VaultGroupJoinOptions,
  type VaultGroupJoinResult,
  type VaultMemberConfig,
} from "./vault-group";
export {
  encodeAllocationData,
  MAX_GROUP_VAULTS,
  type AllocationLeg,
  type EncryptedAllocation,
  type EncryptedAllocationLeg,
} from "./allocation";
export { BatchState } from "./types";
export type { JoinOptions, JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
export { decodeJoined, findJoined, VaultTopics, type JoinedEvent } from "./events";
export {
  BATCHER_DIRECTIONS,
  normalizeBatcherHistory,
  resolveActiveBatcher,
  type BatcherDirection,
  type BatcherHistory,
  type RetiredBatcher,
} from "./batcher-history";

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
  routerJoinContract,
  toTokenContract,
  tokenWrapperRegistryContract,
  totalDepositsContract,
  vaultContract,
} from "./contracts";

// Importing this barrel does not require TanStack Query to be installed: the
// TanStack types below are type-only imports, erased at compile time.
export {
  activeBatcherQueryOptions,
  activeBatchersQueryOptions,
  batchStateQueryOptions,
  claimMutationOptions,
  currentBatchIdQueryOptions,
  depositMutationOptions,
  dispatchBatchMutationOptions,
  groupDepositMutationOptions,
  groupRedeemMutationOptions,
  invalidateAfterClaim,
  invalidateAfterDispatchBatch,
  invalidateAfterGroupJoin,
  invalidateAfterJoin,
  invalidateAfterQuit,
  invalidateBatchQueries,
  joinMutationOptions,
  quitMutationOptions,
  recoverMutationOptions,
  redeemMutationOptions,
  timeUntilDispatchableQueryOptions,
  vaultQueryKeys,
  type ActiveBatcherQueryConfig,
  type ActiveBatchersQueryConfig,
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
