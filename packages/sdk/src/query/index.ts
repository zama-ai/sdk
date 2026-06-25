export { filterQueryOptions, hashFn } from "./utils";
export type { StrippedQueryOptionKeys } from "./utils";
export type { QueryFactoryOptions, MutationFactoryOptions } from "./factory-types";
export { zamaQueryKeys } from "./query-keys";

export {
  invalidateAfterApproveUnderlying,
  invalidateAfterSetOperator,
  invalidateAfterShield,
  invalidateAfterTransfer,
  invalidateAfterUnwrap,
  invalidateAfterUnshield,
  invalidateBalanceQueries,
  invalidateWagmiBalanceQueries,
  invalidateWalletLifecycleQueries,
} from "./invalidation";
export type { QueryClientLike, QueryFilterLike, QueryLike } from "./invalidation";

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
  confidentialIsOperatorQueryOptions,
  type ConfidentialIsOperatorQueryConfig,
} from "./confidential-is-operator";
export {
  confidentialBalanceQueryOptions,
  type ConfidentialBalanceQueryConfig,
} from "./confidential-balance";
export {
  confidentialBalancesQueryOptions,
  type ConfidentialBalancesQueryConfig,
} from "./confidential-balances";
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
export {
  confidentialSetOperatorMutationOptions,
  type ConfidentialSetOperatorParams,
} from "./set-operator";
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
export {
  delegatedDecryptValuesMutationOptions,
  type DelegatedDecryptValuesMutationParams,
} from "./delegated-decrypt";
export { decryptPublicValuesMutationOptions } from "./public-decrypt";
export { grantPermitMutationOptions } from "./grant-permit";
export { hasPermitQueryOptions, type HasPermitQueryConfig } from "./has-permit";
export { revokePermitsMutationOptions } from "./revoke-permits";
export { clearCredentialsMutationOptions } from "./clear-credentials";
export {
  delegateDecryptionMutationOptions,
  type DelegateDecryptionParams,
} from "./delegate-decryption";
export {
  decryptValuesQueryOptions,
  type DecryptResult,
  type EncryptedInput as DecryptInput,
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
export {
  isDelegationPropagatedQueryOptions,
  type IsDelegationPropagatedQueryConfig,
} from "./is-delegation-propagated";
export type { RawLog } from "../events/onchain-events";
export type {
  ConfidentialTransferEvent,
  WrapEvent,
  UnwrapRequestedEvent,
  UnwrapFinalizedEvent,
} from "../events/onchain-events";
export type { OnChainEvent } from "../events/onchain-events";
export type {
  ClearValue,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
} from "../relayer/relayer-sdk.types";
export type { EncryptInput, EIP712TypedData } from "../relayer/relayer-sdk.types";
// Decrypt parameter/result types — aligned with the canonical Zama glossary (see main entry).
export type {
  UserDecryptParams as DecryptValuesParams,
  PublicDecryptResult as DecryptPublicValuesResult,
  DelegatedUserDecryptParams as DelegatedDecryptValuesParams,
} from "../relayer/relayer-sdk.types";
export type { RelayerSDK } from "../relayer/relayer-sdk";
export type { BatchBalancesResult, BatchDecryptAsOptions } from "../token/token";
export type { Token } from "../token/token";
export type { WrappedToken } from "../token/wrapped-token";
export type { ZamaSDK } from "../zama-sdk";
export type { ZamaConfig } from "../config";
export type { TransportKeyPair } from "../credentials";
export type {
  GenericSigner,
  GenericStorage,
  ApprovalStrategy,
  ShieldCallbacks,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  TransactionReceipt,
  TransactionResult,
  ShieldOptions,
  ShieldPath,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
} from "../types";
export { ZamaSDKEvents } from "../events/sdk-events";
export type {
  SetOperatorSubmittedEvent,
  ApproveUnderlyingSubmittedEvent,
  BaseEvent,
  DecryptEndEvent,
  DecryptErrorEvent,
  DecryptStartEvent,
  EncryptEndEvent,
  EncryptErrorEvent,
  EncryptStartEvent,
  FinalizeUnwrapSubmittedEvent,
  ShieldSubmittedEvent,
  TransactionErrorEvent,
  TransactionOperation,
  TransferFromSubmittedEvent,
  TransferSubmittedEvent,
  UnshieldPhase1SubmittedEvent,
  UnshieldPhase2StartedEvent,
  UnshieldPhase2SubmittedEvent,
  UnwrapSubmittedEvent,
  ZamaSDKEvent,
  ZamaSDKEventInput,
  ZamaSDKEventListener,
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
} from "../events/sdk-events";
