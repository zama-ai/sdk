/**
 * `@tanstack/query` integration for `@zama-fhe/sdk` — query-options and
 * mutation-options factories, invalidation helpers, and the shared query-key
 * factory.
 *
 * Non-query types (e.g. {@link Token}, {@link ZamaSDK}, events, errors) should
 * be imported from `@zama-fhe/sdk` directly.
 *
 * @packageDocumentation
 */

export { filterQueryOptions, hashFn } from "./utils";
export type { StrippedQueryOptionKeys } from "./utils";
export type { QueryFactoryOptions, MutationFactoryOptions } from "./factory-types";
export { zamaQueryKeys } from "./query-keys";

export {
  invalidateAfterApproveUnderlying,
  invalidateAfterApprove,
  invalidateAfterShield,
  invalidateAfterTransfer,
  invalidateAfterUnwrap,
  invalidateAfterUnshield,
  invalidateBalanceQueries,
  invalidateWagmiBalanceQueries,
  invalidateWalletLifecycleQueries,
} from "./invalidation";
export type { QueryClientLike, QueryFilterLike, QueryLike } from "./invalidation";

export { signerAddressQueryOptions, type SignerAddressQueryConfig } from "./signer-address";
export {
  tokenMetadataQueryOptions,
  type TokenMetadata,
  type TokenMetadataQueryConfig,
} from "./token-metadata";
export {
  isConfidentialQueryOptions,
  isWrapperQueryOptions,
  type IsConfidentialQueryConfig,
} from "./is-confidential";
export { totalSupplyQueryOptions, type TotalSupplyQueryConfig } from "./total-supply";
export {
  wrapperDiscoveryQueryOptions,
  type WrapperDiscoveryQueryConfig,
} from "./wrapper-discovery";
export {
  underlyingAllowanceQueryOptions,
  type UnderlyingAllowanceQueryConfig,
} from "./underlying-allowance";
export {
  confidentialIsApprovedQueryOptions,
  type ConfidentialIsApprovedQueryConfig,
} from "./confidential-is-approved";
export { publicKeyQueryOptions, type PublicKeyQueryConfig } from "./public-key";
export { publicParamsQueryOptions, type PublicParamsQueryConfig } from "./public-params";
export {
  confidentialBalanceQueryOptions,
  type ConfidentialBalanceQueryConfig,
} from "./confidential-balance";
export {
  confidentialBalancesQueryOptions,
  type ConfidentialBalancesQueryConfig,
} from "./confidential-balances";
export {
  activityFeedQueryOptions,
  deriveActivityFeedLogsKey,
  type ActivityFeedConfig,
  type ActivityFeedQueryConfig,
} from "./activity-feed";

export {
  tokenPairsQueryOptions,
  tokenPairsLengthQueryOptions,
  tokenPairsSliceQueryOptions,
  tokenPairQueryOptions,
  confidentialTokenAddressQueryOptions,
  tokenAddressQueryOptions,
  isConfidentialTokenValidQueryOptions,
  type WrappersRegistryQueryConfig,
  type ConfidentialTokenAddressQueryConfig,
  type TokenAddressQueryConfig,
  type TokenPairsSliceQueryConfig,
  type TokenPairQueryConfig,
  type IsConfidentialTokenValidQueryConfig,
  listPairsQueryOptions,
  type ListPairsQueryConfig,
} from "./wrappers-registry";

export { shieldMutationOptions, type ShieldParams } from "./shield";
export { confidentialTransferMutationOptions, type ConfidentialTransferParams } from "./transfer";
export {
  confidentialTransferFromMutationOptions,
  type ConfidentialTransferFromParams,
} from "./transfer-from";
export { confidentialApproveMutationOptions, type ConfidentialApproveParams } from "./approve";
export {
  approveUnderlyingMutationOptions,
  type ApproveUnderlyingParams,
} from "./approve-underlying";
export { unshieldMutationOptions, type UnshieldParams } from "./unshield";
export { unshieldAllMutationOptions, type UnshieldAllParams } from "./unshield-all";
export { resumeUnshieldMutationOptions, type ResumeUnshieldParams } from "./resume-unshield";
export { unwrapMutationOptions, type UnwrapParams } from "./unwrap";
export { unwrapAllMutationOptions } from "./unwrap-all";
export { finalizeUnwrapMutationOptions, type FinalizeUnwrapParams } from "./finalize-unwrap";
export { encryptMutationOptions } from "./encrypt";
export { generateKeypairMutationOptions } from "./generate-keypair";
export { createEIP712MutationOptions, type CreateEIP712Params } from "./create-eip712";
export {
  createDelegatedUserDecryptEIP712MutationOptions,
  type CreateDelegatedUserDecryptEIP712Params,
} from "./create-delegated-user-decrypt-eip712";
export { delegatedUserDecryptMutationOptions } from "./delegated-user-decrypt";
export { publicDecryptMutationOptions } from "./public-decrypt";
export { requestZKProofVerificationMutationOptions } from "./request-zk-proof-verification";
export { allowMutationOptions } from "./allow";
export { isAllowedQueryOptions, type IsAllowedQueryConfig } from "./is-allowed";
export { revokeMutationOptions } from "./revoke";
export { revokeSessionMutationOptions } from "./revoke-session";
export {
  delegateDecryptionMutationOptions,
  type DelegateDecryptionParams,
} from "./delegate-decryption";
export {
  userDecryptQueryOptions,
  type UserDecryptQueryConfig,
  type DecryptResult,
  type DecryptHandle,
} from "./user-decrypt";
export { decryptBalanceAsMutationOptions, type DecryptBalanceAsParams } from "./decrypt-balance-as";
export {
  batchDecryptBalancesAsMutationOptions,
  type BatchDecryptBalancesAsParams,
} from "./batch-decrypt-balances-as";
export { revokeDelegationMutationOptions, type RevokeDelegationParams } from "./revoke-delegation";
export {
  delegationStatusQueryOptions,
  type DelegationStatusData,
  type DelegationStatusQueryConfig,
} from "./delegation-status";
