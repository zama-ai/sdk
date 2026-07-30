export { filterQueryOptions, hashFn } from "./utils";
export type { StrippedQueryOptionKeys } from "./utils";
export type { QueryFactoryOptions, MutationFactoryOptions } from "./factory-types";
export type { SignerQueryContext } from "./signer-query-context";
export { zamaQueryKeys } from "./query-keys";

export {
  invalidateAfterApproveUnderlying,
  invalidateAfterSetOperator,
  invalidateAfterShield,
  invalidateAfterTransfer,
  invalidateAfterUnwrap,
  invalidateAfterUnshield,
  invalidateAfterUnshieldSettled,
  invalidateAfterWrap,
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
export { pendingUnshieldQueryOptions, type PendingUnshieldQueryConfig } from "./pending-unshield";
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
  confidentialTransferAndCallMutationOptions,
  type ConfidentialTransferAndCallParams,
} from "./transfer-and-call";
export {
  confidentialTransferFromMutationOptions,
  type ConfidentialTransferFromParams,
} from "./transfer-from";
export {
  confidentialTransferFromAndCallMutationOptions,
  type ConfidentialTransferFromAndCallParams,
} from "./transfer-from-and-call";
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
export { wrapMutationOptions, type WrapParams } from "./wrap";
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
export {
  prepareMutationOptions,
  signMutationOptions,
  type PrepareParams,
  type PrepareResult,
  type SignParams,
} from "./prepare";
export { broadcastMutationOptions, type BroadcastParams } from "./broadcast";
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
  type DelegationStatus,
  type DelegationStatusQueryConfig,
} from "./delegation-status";
export type { RawLog } from "../events/onchain-events";
export type {
  ConfidentialTransferEvent,
  WrapEvent,
  UnwrapRequestedEvent,
  UnwrapFinalizedEvent,
} from "../events/onchain-events";
export type { OnChainEvent } from "../events/onchain-events";
export type { ClearValue, EncryptParams, EncryptResult, EncryptedValue } from "../relayer/types";
export type { EncryptInput, EIP712TypedData } from "../relayer/types";
// Decrypt parameter/result types — aligned with the canonical Zama glossary (see main entry).
export type { DecryptPublicValuesResult } from "../relayer/types";
export type { BatchBalancesResult, BatchDecryptAsOptions } from "../token/token";
export type { Token } from "../token/token";
export type { WrappedToken } from "../token/wrapped-token";
export type { ZamaSDK } from "../zama-sdk";
export type { ZamaConfig } from "../config";
export type { SerializedTransportKeyPair } from "../credentials";
export type {
  GenericSigner,
  GenericProvider,
  GenericStorage,
  GenericLogger,
  ApprovalStrategy,
  ShieldCallbacks,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
  ContractAbi,
  WriteFunctionName,
  WriteContractArgs,
  WriteContractConfig,
  TransactionReceipt,
  TransactionResult,
  ShieldOptions,
  ShieldPath,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
  WrapOptions,
  UnwrapResult,
} from "../types";
export type { FheChain, FheChainAuth } from "../chains/types";
export type { FhevmRelayerOptions, FhevmRuntimeConfig } from "../relayer/types";
export type { FhevmClient, RelayerSDK } from "../relayer/types";
export type {
  ReadFunctionName,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
} from "../types";
export type { ZamaError, ZamaErrorCode } from "../errors";
export type {
  WrappersRegistry,
  WrappersRegistryConfig,
  ListPairsOptions,
} from "../wrappers-registry";
export type { PaginatedResult, TokenWrapperPair, TokenWrapperPairWithMetadata } from "../contracts";
export type { Permits, Delegations, Decryption } from "../namespaces";
export type {
  DelegatedDecryptOptions,
  BatchDecryptResult,
  BatchDecryptItem,
} from "../services/decryption-service";
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
  WrapSubmittedEvent,
  ZamaSDKEvent,
  ZamaSDKEventListener,
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
} from "../events/sdk-events";
