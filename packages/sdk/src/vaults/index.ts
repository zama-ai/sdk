/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { VaultBatcher } from "./vault-batcher";
export { createVault, Vault } from "./vault";
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
  invalidateAfterClaim,
  invalidateAfterDispatchBatch,
  invalidateAfterJoin,
  invalidateAfterQuit,
  invalidateBatchQueries,
  joinMutationOptions,
  quitMutationOptions,
  recoverMutationOptions,
  requestWithdrawalMutationOptions,
  timeUntilDispatchableQueryOptions,
  vaultQueryKeys,
  type BatchStateQueryConfig,
  type ClaimParams,
  type CurrentBatchIdQueryConfig,
  type DepositParams,
  type JoinParams,
  type QuitParams,
  type RecoverParams,
  type RequestWithdrawalParams,
  type TimeUntilDispatchableQueryConfig,
} from "./query";
