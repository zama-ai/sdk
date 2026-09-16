/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { VaultBatcher } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export { BatchState } from "./types";
export type { JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
export { findJoined, type JoinedEvent } from "./events";

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
  joinMutationOptions,
  quitMutationOptions,
  requestWithdrawalMutationOptions,
  timeUntilDispatchableQueryOptions,
  vaultQueryKeys,
  type BatchStateQueryConfig,
  type ClaimParams,
  type CurrentBatchIdQueryConfig,
  type DepositParams,
  type JoinParams,
  type QuitParams,
  type RequestWithdrawalParams,
  type TimeUntilDispatchableQueryConfig,
} from "./query";
