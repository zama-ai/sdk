/**
 * React hooks for confidential contract operations, built on React Query.
 *
 * Requires {@link ZamaProvider} in the component tree. Re-exports all public
 * symbols from `@zama-fhe/sdk`.
 *
 * @packageDocumentation
 */

// Provider
export { ZamaProvider, useZamaSDK, type ZamaProviderProps } from "./provider";

// SDK method hooks
export { useEncrypt } from "./relayer/use-encrypt";
export {
  useUserDecrypt,
  type UseUserDecryptConfig,
  type UseUserDecryptResult,
} from "./relayer/use-user-decrypt";
export {
  useDecryptedValue,
  type UseDecryptedValueConfig,
  type UseDecryptedValueResult,
} from "./relayer/use-decrypted-value";

export { usePublicDecrypt } from "./relayer/use-public-decrypt";
export { useGenerateKeypair } from "./relayer/use-generate-keypair";
export { useCreateEIP712 } from "./relayer/use-create-eip712";
export type { CreateEIP712Params } from "./relayer/use-create-eip712";
export { useCreateDelegatedUserDecryptEIP712 } from "./relayer/use-create-delegated-user-decrypt-eip712";
export type { CreateDelegatedUserDecryptEIP712Params } from "./relayer/use-create-delegated-user-decrypt-eip712";
export { useDelegatedUserDecrypt } from "./relayer/use-delegated-user-decrypt";
export { useRequestZKProofVerification } from "./relayer/use-request-zk-proof-verification";
export { usePublicKey, type PublicKeyData } from "./relayer/use-public-key";
export { usePublicParams, type PublicParamsData } from "./relayer/use-public-params";

// Re-export core classes
export {
  RelayerWeb,
  ZamaSDK,
  Token,
  ReadonlyToken,
  WrappersRegistry,
  DefaultRegistryAddresses,
  MemoryStorage,
  memoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  CredentialsManager,
  DelegatedCredentialsManager,
  ChromeSessionStorage,
  chromeSessionStorage,
} from "@zama-fhe/sdk";

// Re-export core types
export type {
  RelayerSDK,
  RelayerWebConfig,
  RelayerWebSecurityConfig,
  ZamaSDKConfig,
  TokenConfig,
  ReadonlyTokenConfig,
  BatchDecryptOptions,
  FhevmInstanceConfig,
  NetworkType,
  RelayerSDKStatus,
  EncryptResult,
  EncryptParams,
  EncryptInput,
  Handle,
  FheTypeName,
  ClearValueType,
  UserDecryptParams,
  PublicDecryptResult,
  KeypairType,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
  InputProofBytesType,
  BatchTransferData,
  TokenWrapperPair,
  TokenWrapperPairWithMetadata,
  PaginatedResult,
  StoredCredentials,
  UnshieldCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
  WrappersRegistryConfig,
  ListPairsOptions,
  DelegatedCredentialsManagerConfig,
  DelegatedStoredCredentials,
  BatchDecryptAsOptions,
  CredentialsManagerConfig,
  ZamaSDKEventType,
  ZamaSDKEvent,
  ZamaSDKEventInput,
  ZamaSDKEventListener,
  BaseEvent,
  ShieldSubmittedEvent,
  TransferSubmittedEvent,
  TransferFromSubmittedEvent,
  ApproveSubmittedEvent,
  ApproveUnderlyingSubmittedEvent,
  UnwrapSubmittedEvent,
  FinalizeUnwrapSubmittedEvent,
  UnshieldPhase1SubmittedEvent,
  UnshieldPhase2StartedEvent,
  UnshieldPhase2SubmittedEvent,
  TransactionErrorEvent,
  EncryptStartEvent,
  EncryptEndEvent,
  EncryptErrorEvent,
  DecryptStartEvent,
  DecryptEndEvent,
  DecryptErrorEvent,
  CredentialsLoadingEvent,
  CredentialsCachedEvent,
  CredentialsExpiredEvent,
  CredentialsCreatingEvent,
  CredentialsCreatedEvent,
  CredentialsRevokedEvent,
  CredentialsAllowedEvent,
  SessionExpiredEvent,
} from "@zama-fhe/sdk";

// Re-export pending-unshield persistence utilities
export { savePendingUnshield, loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

// Re-export event constants
export { ZamaSDKEvents } from "@zama-fhe/sdk";

// Re-export network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

// Re-export constants
export { ERC7984_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID } from "@zama-fhe/sdk";

// Re-export all contract call builders
export {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  isOperatorContract,
  confidentialBatchTransferContract,
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  setOperatorContract,
  getWrapperContract,
  wrapperExistsContract,
  underlyingContract,
  wrapContract,
  wrapETHContract,
  supportsInterfaceContract,
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
  nameContract,
  symbolContract,
  decimalsContract,
  balanceOfContract,
  allowanceContract,
  approveContract,
  confidentialTotalSupplyContract,
  totalSupplyContract,
  rateContract,
  deploymentCoordinatorContract,
  isFinalizeUnwrapOperatorContract,
  setFinalizeUnwrapOperatorContract,
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
  isHandleDelegatedContract,
} from "@zama-fhe/sdk";

// Authorization hooks (generic — any contract with encrypted state)
export { useAllow } from "./authorization/use-allow";
export { useIsAllowed } from "./authorization/use-is-allowed";
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
export { useShieldETH, type UseShieldETHConfig } from "./shield/use-shield-eth";
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
export { useMetadata, useMetadataSuspense, type TokenMetadata } from "./token/use-metadata";
export { useActivityFeed, type UseActivityFeedConfig } from "./balance/use-activity-feed";
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
export {
  useShieldFee,
  useUnshieldFee,
  useBatchTransferFee,
  useFeeRecipient,
  type UseFeeConfig,
} from "./token/use-fees";

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

// Re-export query utilities and factories from core sdk/query
export {
  zamaQueryKeys,
  hashFn,
  filterQueryOptions,
  signerAddressQueryOptions,
  tokenMetadataQueryOptions,
  isConfidentialQueryOptions,
  isWrapperQueryOptions,
  totalSupplyQueryOptions,
  wrapperDiscoveryQueryOptions,
  underlyingAllowanceQueryOptions,
  confidentialIsApprovedQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  publicKeyQueryOptions,
  publicParamsQueryOptions,
  confidentialHandleQueryOptions,
  confidentialBalanceQueryOptions,
  confidentialHandlesQueryOptions,
  confidentialBalancesQueryOptions,
  type ConfidentialBalancesData,
  activityFeedQueryOptions,
  shieldMutationOptions,
  type ShieldParams,
  shieldETHMutationOptions,
  type ShieldETHParams,
  confidentialTransferMutationOptions,
  type ConfidentialTransferParams,
  confidentialTransferFromMutationOptions,
  type ConfidentialTransferFromParams,
  confidentialApproveMutationOptions,
  type ConfidentialApproveParams,
  approveUnderlyingMutationOptions,
  type ApproveUnderlyingParams,
  unshieldMutationOptions,
  type UnshieldParams,
  unshieldAllMutationOptions,
  type UnshieldAllParams,
  resumeUnshieldMutationOptions,
  type ResumeUnshieldParams,
  unwrapMutationOptions,
  type UnwrapParams,
  unwrapAllMutationOptions,
  finalizeUnwrapMutationOptions,
  type FinalizeUnwrapParams,
  encryptMutationOptions,
  generateKeypairMutationOptions,
  createEIP712MutationOptions,
  createDelegatedUserDecryptEIP712MutationOptions,
  delegatedUserDecryptMutationOptions,
  publicDecryptMutationOptions,
  requestZKProofVerificationMutationOptions,
  userDecryptMutationOptions,
  type DecryptResult,
  type UserDecryptMutationParams,
  type UserDecryptOptions,
  type DecryptHandle,
  allowMutationOptions,
  isAllowedQueryOptions,
  revokeMutationOptions,
  revokeSessionMutationOptions,
  delegateDecryptionMutationOptions,
  type DelegateDecryptionParams,
  decryptBalanceAsMutationOptions,
  type DecryptBalanceAsParams,
  batchDecryptBalancesAsMutationOptions,
  type BatchDecryptBalancesAsParams,
  revokeDelegationMutationOptions,
  type RevokeDelegationParams,
  delegationStatusQueryOptions,
  type DelegationStatusData,
  type DelegationStatusQueryConfig,
  listPairsQueryOptions,
  type ListPairsQueryConfig,
} from "@zama-fhe/sdk/query";
export type {
  OptimisticBalanceSnapshot,
  OptimisticMutateContext,
} from "./balance/optimistic-balance-update";

// Re-export event decoders, types, and constants from core SDK
export { ZERO_HANDLE } from "@zama-fhe/sdk";
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrappedEvent,
  UnwrapRequestedEvent,
  UnwrappedFinalizedEvent,
  UnwrappedStartedEvent,
  OnChainEvent,
  DelegatedForUserDecryptionEvent,
  RevokedDelegationForUserDecryptionEvent,
  AclEvent,
} from "@zama-fhe/sdk";
export {
  Topics,
  TOKEN_TOPICS,
  ACL_TOPICS,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  decodeAclEvent,
  decodeAclEvents,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrappedFinalized,
  decodeUnwrappedStarted,
  decodeOnChainEvent,
  decodeOnChainEvents,
  findUnwrapRequested,
  findWrapped,
} from "@zama-fhe/sdk";

// Re-export activity feed types and helpers from core SDK
export type {
  ActivityDirection,
  ActivityType,
  ActivityAmount,
  ActivityLogMetadata,
  ActivityItem,
} from "@zama-fhe/sdk";
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";

// Re-export core types from SDK
export type {
  Address,
  Hex,
  GenericSigner,
  GenericStorage,
  ContractAbi,
  ReadContractConfig,
  ReadContractArgs,
  ReadContractReturnType,
  ReadFunctionName,
  WriteContractConfig,
  WriteContractArgs,
  WriteFunctionName,
  TransactionReceipt,
  TransactionResult,
} from "@zama-fhe/sdk";
export {
  ZamaError,
  ZamaErrorCode,
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
  KeypairExpiredError,
  InvalidKeypairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationDelegateEqualsContractError,
  DelegationExpiryUnchangedError,
  AclPausedError,
  DelegationContractIsSelfError,
  DelegationExpirationTooSoonError,
  DelegationNotPropagatedError,
  ConfigurationError,
  matchZamaError,
} from "@zama-fhe/sdk";
