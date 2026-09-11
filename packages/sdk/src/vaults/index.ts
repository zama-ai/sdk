/**
 * Confidential Vault (batch deposit/redeem) module.
 *
 * A separate subpath (`@zama-fhe/sdk/vaults`), not part of the main entry
 * point — import from here explicitly, and nothing here is pulled into a
 * bundle that never imports it (the same tree-shaking guarantee `/web`,
 * `/node`, `/viem`, and `/ethers` already provide).
 *
 * Main exports: {@link Vault}, {@link createVault}, {@link VaultBatcher}.
 *
 * @packageDocumentation
 */
export { VaultBatcher } from "./vault-batcher";
export { createVault, Vault } from "./vault";
export type { VaultAddresses, VaultJoinOptions } from "./types";

export {
  batchStateContract,
  callbackDeadlineContract,
  claimContract,
  currentBatchIdContract,
  depositsContract,
  dispatchBatchContract,
  fromTokenContract,
  joinContract,
  minBatchAgeContract,
  quitContract,
  recoverContract,
  toTokenContract,
  totalDepositsContract,
  vaultContract,
} from "./contracts";

// TanStack Query options factories — see `@zama-fhe/react-sdk/vaults` for the
// React hook layer built on these. Safe to import even without TanStack Query
// installed: the TanStack types are type-only imports, erased at compile time.
export {
  batchStateQueryOptions,
  claimMutationOptions,
  currentBatchIdQueryOptions,
  depositMutationOptions,
  dispatchBatchMutationOptions,
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
