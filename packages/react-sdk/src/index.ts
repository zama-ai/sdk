/**
 * React hooks for confidential contract operations, built on React Query.
 *
 * Requires {@link ZamaProvider} in the component tree.
 *
 * @packageDocumentation
 */

// Provider
export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";

// SDK method hooks
export { useEncrypt } from "./relayer/use-encrypt";
export { useUserDecrypt, type UseUserDecryptResult } from "./relayer/use-user-decrypt";

export { usePublicDecrypt } from "./relayer/use-public-decrypt";
export { useGenerateKeypair } from "./relayer/use-generate-keypair";
export { useCreateEIP712 } from "./relayer/use-create-eip712";
export { useCreateDelegatedUserDecryptEIP712 } from "./relayer/use-create-delegated-user-decrypt-eip712";
export { useDelegatedUserDecrypt } from "./relayer/use-delegated-user-decrypt";
export { useRequestZKProofVerification } from "./relayer/use-request-zk-proof-verification";
export { usePublicKey } from "./relayer/use-public-key";
export { usePublicParams } from "./relayer/use-public-params";

// Authorization hooks (generic — any contract with encrypted state)
export { useAllow } from "./authorization/use-allow";
export { useIsAllowed, type UseIsAllowedConfig } from "./authorization/use-is-allowed";
export { useRevoke } from "./authorization/use-revoke";
export { useRevokeSession } from "./authorization/use-revoke-session";

// Token hooks (ERC-20 token operations)
export { useToken, type UseZamaConfig } from "./token/use-token";
export { useReadonlyToken } from "./token/use-readonly-token";
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
export { useConfidentialTransferFrom } from "./transfer/use-confidential-transfer-from";
export { useConfidentialApprove } from "./transfer/use-confidential-approve";
export {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
  type UseConfidentialIsApprovedConfig,
  type UseConfidentialIsApprovedSuspenseConfig,
} from "./transfer/use-confidential-is-approved";
export { useShield, type UseShieldConfig } from "./shield/use-shield";
export { useUnwrap } from "./unwrap/use-unwrap";
export { useUnwrapAll } from "./unwrap/use-unwrap-all";
export { useFinalizeUnwrap } from "./unwrap/use-finalize-unwrap";
export { useUnshield } from "./unshield/use-unshield";
export { useUnshieldAll } from "./unshield/use-unshield-all";
export { useResumeUnshield } from "./unshield/use-resume-unshield";
export {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
  type UseUnderlyingAllowanceConfig,
} from "./shield/use-underlying-allowance";
export {
  useWrapperDiscovery,
  useWrapperDiscoverySuspense,
  type UseWrapperDiscoveryConfig,
  type UseWrapperDiscoverySuspenseConfig,
} from "./token/use-wrapper-discovery";
export { useMetadata, useMetadataSuspense } from "./token/use-metadata";
export { useDelegateDecryption } from "./delegation/use-delegate-decryption";
export { useRevokeDelegation } from "./delegation/use-revoke-delegation";
export {
  useDelegationStatus,
  type UseDelegationStatusConfig,
} from "./delegation/use-delegation-status";
export { useDecryptBalanceAs } from "./delegation/use-decrypt-balance-as";
export { useBatchDecryptBalancesAs } from "./delegation/use-batch-decrypt-balances-as";
export { useApproveUnderlying } from "./shield/use-approve-underlying";
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
