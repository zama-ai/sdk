/**
 * React hooks for confidential token operations, built on React Query.
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
export { useUserDecrypt, type UseUserDecryptConfig } from "./relayer/use-user-decrypt";

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

// Read hooks (cached lookups)
export { useUserDecryptedValue } from "./relayer/use-user-decrypted-value";
export { useUserDecryptedValues } from "./relayer/use-user-decrypted-values";

// Re-export core classes
export {
  RelayerWeb,
  ZamaSDK,
  Token,
  ReadonlyToken,
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
  StoredCredentials,
  UnshieldCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
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
} from "@zama-fhe/sdk";

// Token hooks
export { useToken, type UseZamaConfig } from "./token/use-token";
export { useReadonlyToken } from "./token/use-readonly-token";
export {
  useConfidentialBalance,
  type UseConfidentialBalanceConfig,
  type UseConfidentialBalanceOptions,
} from "./token/use-confidential-balance";
export {
  useConfidentialBalances,
  type UseConfidentialBalancesConfig,
  type UseConfidentialBalancesOptions,
} from "./token/use-confidential-balances";
export { useAllowTokens } from "./token/use-allow-tokens";
export { useIsAllowed } from "./token/use-is-allowed";
export { useRevokeTokens } from "./token/use-revoke-tokens";
export { useRevokeSession } from "./token/use-revoke-session";
export {
  useConfidentialTransfer,
  type UseConfidentialTransferConfig,
} from "./token/use-confidential-transfer";
export { useConfidentialTransferFrom } from "./token/use-confidential-transfer-from";
export { useConfidentialApprove } from "./token/use-confidential-approve";
export {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
  type UseConfidentialIsApprovedConfig,
  type UseConfidentialIsApprovedSuspenseConfig,
} from "./token/use-confidential-is-approved";
export { useShield, type UseShieldConfig } from "./token/use-shield";
export { useShieldETH, type UseShieldETHConfig } from "./token/use-shield-eth";
export { useUnwrap } from "./token/use-unwrap";
export { useUnwrapAll } from "./token/use-unwrap-all";
export { useFinalizeUnwrap } from "./token/use-finalize-unwrap";
export { useUnshield } from "./token/use-unshield";
export { useUnshieldAll } from "./token/use-unshield-all";
export { useResumeUnshield } from "./token/use-resume-unshield";
export {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
  type UseUnderlyingAllowanceConfig,
} from "./token/use-underlying-allowance";
export {
  useWrapperDiscovery,
  useWrapperDiscoverySuspense,
  type UseWrapperDiscoveryConfig,
  type UseWrapperDiscoverySuspenseConfig,
} from "./token/use-wrapper-discovery";
export { useMetadata, useMetadataSuspense, type TokenMetadata } from "./token/use-metadata";
export { useActivityFeed, type UseActivityFeedConfig } from "./token/use-activity-feed";
export { useDelegateDecryption } from "./token/use-delegate-decryption";
export { useRevokeDelegation } from "./token/use-revoke-delegation";
export { useDelegationStatus, type UseDelegationStatusConfig } from "./token/use-delegation-status";
export { useDecryptBalanceAs } from "./token/use-decrypt-balance-as";
export { useBatchDecryptBalancesAs } from "./token/use-batch-decrypt-balances-as";
export { useApproveUnderlying } from "./token/use-approve-underlying";
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
  type UserDecryptMutationParams,
  type UserDecryptCallbacks,
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
} from "@zama-fhe/sdk/query";
export type {
  OptimisticBalanceSnapshot,
  OptimisticMutateContext,
} from "./token/optimistic-balance-update";

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
} from "@zama-fhe/sdk";
export {
  Topics,
  TOKEN_TOPICS,
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

// Re-export token types from core SDK
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
  matchZamaError,
} from "@zama-fhe/sdk";
