/**
 * Confidential ERC-4626 vaults: batched deposits and redemptions.
 *
 * @packageDocumentation
 */
export { createVaultBatcher, VaultBatcher, type PreparedFinalize } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export { createVaultGroup, MAX_GROUP_VAULTS, VaultGroup } from "./vault-group";
export { decodeVaultGroupJoins, vaultGroupRedeemOperators } from "./vault-group-standalone";
export {
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
} from "./vault-group-types";
export { BatchState } from "./types";
export type {
  BatchStatus,
  JoinOptions,
  JoinResult,
  VaultAddresses,
  VaultJoinOptions,
} from "./types";
export { decodeJoined, findJoined, openBatchIds, VaultTopics, type JoinedEvent } from "./events";

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
  batchStatusQueryOptions,
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
  type BatchStatusQueryConfig,
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
