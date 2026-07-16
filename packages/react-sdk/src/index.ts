/**
 * React hooks for confidential contract operations, built on React Query.
 *
 * Requires {@link ZamaProvider} in the component tree. Core SDK symbols
 * (classes, types, utilities) should be imported directly from `@zama-fhe/sdk`.
 *
 * @packageDocumentation
 */

// Provider
export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";

// SDK method hooks
export { useEncrypt } from "./relayer/use-encrypt";
export { useDecryptValues, type UseDecryptValuesResult } from "./decrypt/use-user-decrypt";

export { useDecryptPublicValues } from "./decrypt/use-public-decrypt";
export { useDelegatedDecryptValues } from "./decrypt/use-delegated-decrypt";

// Authorization hooks (generic — any contract with encrypted state)
export { useGrantPermit } from "./permits/use-grant-permit";
export { useHasPermit, type UseHasPermitConfig } from "./permits/use-has-permit";
export { useRevokePermits } from "./permits/use-revoke-permits";
export { useClearCredentials } from "./permits/use-clear-credentials";

// Token hooks (ERC-20 token operations)
export { useToken } from "./token/use-token";
export { useWrappedToken } from "./token/use-wrapped-token";
export {
  useConfidentialBalance,
  type UseConfidentialBalanceConfig,
  type UseConfidentialBalanceOptions,
} from "./balance/use-confidential-balance";
export {
  useConfidentialBalances,
  type UseConfidentialBalancesConfig,
  type UseConfidentialBalancesOptions,
} from "./balance/use-confidential-balances";
export {
  useConfidentialTransfer,
  type UseConfidentialTransferConfig,
} from "./transfer/use-confidential-transfer";
export {
  useConfidentialTransferAndCall,
  type UseConfidentialTransferAndCallConfig,
} from "./transfer/use-confidential-transfer-and-call";
export { useConfidentialTransferFrom } from "./transfer/use-confidential-transfer-from";
export { useConfidentialTransferFromAndCall } from "./transfer/use-confidential-transfer-from-and-call";
export { useConfidentialSetOperator } from "./operator/use-confidential-set-operator";
export {
  useConfidentialIsOperator,
  useConfidentialIsOperatorSuspense,
  type UseConfidentialIsOperatorConfig,
  type UseConfidentialIsOperatorSuspenseConfig,
} from "./operator/use-confidential-is-operator";
export { useShield, type UseShieldConfig } from "./shield/use-shield";
export { useUnwrap } from "./unwrap/use-unwrap";
export { useUnwrapAll } from "./unwrap/use-unwrap-all";
export { useFinalizeUnwrap } from "./unwrap/use-finalize-unwrap";
export { useUnshield } from "./unshield/use-unshield";
export { useUnshieldAll } from "./unshield/use-unshield-all";
export { useResumeUnshield } from "./unshield/use-resume-unshield";
export { usePendingUnshield, usePendingUnshieldSuspense } from "./unshield/use-pending-unshield";
export {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
  type UseUnderlyingAllowanceConfig,
  type UseUnderlyingAllowanceSuspenseConfig,
} from "./shield/use-underlying-allowance";
export {
  useWrapperDiscovery,
  useWrapperDiscoverySuspense,
  type UseWrapperDiscoveryConfig,
  type UseWrapperDiscoverySuspenseConfig,
} from "./token/use-wrapper-discovery";
export { useMetadata, useMetadataSuspense } from "./token/use-metadata";
export { useDelegateDecryption } from "./delegations/use-delegate-decryption";
export { useRevokeDelegation } from "./delegations/use-revoke-delegation";
export {
  useDelegationStatus,
  type UseDelegationStatusConfig,
} from "./delegations/use-delegation-status";
export { useDecryptBalanceAs } from "./delegations/use-decrypt-balance-as";
export { useBatchDecryptBalancesAs } from "./delegations/use-batch-decrypt-balances-as";
export { useApproveUnderlying } from "./shield/use-approve-underlying";
export { useWrap } from "./shield/use-wrap";
export {
  useIsConfidential,
  useIsConfidentialSuspense,
  useIsWrapper,
  useIsWrapperSuspense,
} from "./token/use-is-confidential";
export { useTotalSupply, useTotalSupplySuspense } from "./token/use-total-supply";
// Registry hooks (wagmi-based, read from on-chain ConfidentialTokenWrappersRegistry)
export { useWrappersRegistryAddress } from "./wrappers-registry/use-wrappers-registry-address";
export { useTokenPairsRegistry } from "./wrappers-registry/use-token-pairs-registry";
export { useTokenPairsLength } from "./wrappers-registry/use-token-pairs-length";
export { useTokenPairsSlice } from "./wrappers-registry/use-token-pairs-slice";
export { useTokenPair } from "./wrappers-registry/use-token-pair";
export { useConfidentialTokenAddress } from "./wrappers-registry/use-confidential-token-address";
export { useTokenAddress } from "./wrappers-registry/use-token-address";
export { useIsConfidentialTokenValid } from "./wrappers-registry/use-is-confidential-token-valid";
export { useListPairs } from "./wrappers-registry/use-list-pairs";

export { usePrepare, useSign, useBroadcast, useResume, useRefreshPrepared } from "./offline";
