/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultBatcher, VaultBatcher, type PreparedFinalize } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export {
  createVaultGroup,
  decodeVaultGroupJoins,
  MAX_GROUP_VAULTS,
  VaultGroup,
  vaultGroupRedeemOperators,
  type DecodedVaultGroupJoins,
  type JoinDelivery,
  type PreparedVaultGroupJoin,
  type PreparedVaultGroupWrite,
  type PrepareVaultGroupJoinOptions,
  type VaultGroupConfig,
  type VaultGroupJoin,
  type VaultGroupLeg,
  type VaultGroupOperator,
  type VaultGroupRedeemOptions,
  type VaultGroupJoinResult,
  type VaultGroupMember,
  type VaultMemberConfig,
} from "./vault-group";
export { BatchState } from "./types";
export type { JoinOptions, JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
export { decodeJoined, findJoined, takeJoined, VaultTopics, type JoinedEvent } from "./events";

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
  dispatchBatchCallbackContract,
  dispatchBatchContract,
  encodeAllocationData,
  exchangeRateContract,
  exchangeRateDecimalsContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  pausedContract,
  quitContract,
  recoverContract,
  routerJoinContract,
  tokenWrapperRegistryContract,
  toTokenContract,
  totalDepositsContract,
  unwrapRequestIdContract,
  vaultContract,
  type EncryptedAllocationLeg,
} from "./contracts";

// Importing this barrel does not require TanStack Query to be installed: the
// TanStack types below are type-only imports, erased at compile time.
export {
  batchStateQueryOptions,
  claimMutationOptions,
  currentBatchIdQueryOptions,
  depositMutationOptions,
  dispatchBatchMutationOptions,
  finalizeMutationOptions,
  groupDepositMutationOptions,
  groupRedeemMutationOptions,
  invalidateAfterClaim,
  invalidateAfterDispatchBatch,
  invalidateAfterFinalize,
  invalidateAfterGroupJoin,
  invalidateAfterJoin,
  invalidateAfterQuit,
  invalidateBatchQueries,
  joinMutationOptions,
  quitMutationOptions,
  recoverMutationOptions,
  redeemMutationOptions,
  timeUntilCallbackDeadlineQueryOptions,
  timeUntilDispatchableQueryOptions,
  vaultQueryKeys,
  type BatchStateQueryConfig,
  type ClaimParams,
  type CurrentBatchIdQueryConfig,
  type DepositParams,
  type FinalizeParams,
  type GroupDepositParams,
  type GroupRedeemParams,
  type JoinParams,
  type QuitParams,
  type RecoverParams,
  type RedeemParams,
  type TimeUntilCallbackDeadlineQueryConfig,
  type TimeUntilDispatchableQueryConfig,
} from "./query";
