// Provider
export { TokenSDKProvider, useTokenSDK } from "./provider";

// SDK method hooks
export { useEncrypt, encryptMutationOptions } from "./relayer/use-encrypt";
export { useUserDecrypt } from "./relayer/use-user-decrypt";
export { usePublicDecrypt } from "./relayer/use-public-decrypt";
export { useGenerateKeypair } from "./relayer/use-generate-keypair";
export { useCreateEIP712 } from "./relayer/use-create-eip712";
export type { CreateEIP712Params } from "./relayer/use-create-eip712";
export { useCreateDelegatedUserDecryptEIP712 } from "./relayer/use-create-delegated-user-decrypt-eip712";
export type { CreateDelegatedUserDecryptEIP712Params } from "./relayer/use-create-delegated-user-decrypt-eip712";
export { useDelegatedUserDecrypt } from "./relayer/use-delegated-user-decrypt";
export { useRequestZKProofVerification } from "./relayer/use-request-zk-proof-verification";
export {
  usePublicKey,
  publicKeyQueryKeys,
  publicKeyQueryOptions,
  type PublicKeyData,
} from "./relayer/use-public-key";
export {
  usePublicParams,
  publicParamsQueryKeys,
  publicParamsQueryOptions,
  type PublicParamsData,
} from "./relayer/use-public-params";

// Read hooks (cached lookups)
export { useUserDecryptedValue } from "./relayer/use-user-decrypted-value";
export { useUserDecryptedValues } from "./relayer/use-user-decrypted-values";
export { decryptionKeys } from "./relayer/decryption-cache";

// Re-export core classes
export {
  RelayerWeb,
  TokenSDK,
  Token,
  ReadonlyToken,
  MemoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  CredentialsManager,
} from "@zama-fhe/sdk";

// Re-export core types
export type {
  RelayerSDK,
  RelayerWebConfig,
  TokenSDKConfig,
  TokenConfig,
  ReadonlyTokenConfig,
  BatchDecryptOptions,
  FhevmInstanceConfig,
  NetworkType,
  RelayerSDKStatus,
  EncryptResult,
  EncryptParams,
  UserDecryptParams,
  PublicDecryptResult,
  FHEKeypair,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
  InputProofBytesType,
  BatchTransferData,
  StoredCredentials,
} from "@zama-fhe/sdk";

// Re-export network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

// Re-export constants
export { ERC7984_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID } from "@zama-fhe/sdk";

// Re-export ABIs
export {
  ERC20_ABI,
  ERC20_METADATA_ABI,
  DEPLOYMENT_COORDINATOR_ABI,
  ERC165_ABI,
  ENCRYPTION_ABI,
  FEE_MANAGER_ABI,
  TRANSFER_BATCHER_ABI,
  WRAPPER_ABI,
  BATCH_SWAP_ABI,
} from "@zama-fhe/sdk";

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
export { useToken, type UseTokenConfig } from "./token/use-token";
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
export { useAuthorizeAll, authorizeAllMutationOptions } from "./token/use-authorize-all";
export {
  useConfidentialTransfer,
  confidentialTransferMutationOptions,
  type ConfidentialTransferParams,
  type UseConfidentialTransferConfig,
} from "./token/use-confidential-transfer";
export {
  useConfidentialTransferFrom,
  confidentialTransferFromMutationOptions,
  type ConfidentialTransferFromParams,
} from "./token/use-confidential-transfer-from";
export {
  useConfidentialApprove,
  confidentialApproveMutationOptions,
  type ConfidentialApproveParams,
} from "./token/use-confidential-approve";
export {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
  confidentialIsApprovedQueryKeys,
  confidentialIsApprovedQueryOptions,
  type UseConfidentialIsApprovedConfig,
  type UseConfidentialIsApprovedSuspenseConfig,
} from "./token/use-confidential-is-approved";
export {
  useWrap,
  wrapMutationOptions,
  type WrapParams,
  type UseWrapConfig,
} from "./token/use-wrap";
export { useShield } from "./token/use-shield";
export { useWrapETH, wrapETHMutationOptions, type WrapETHParams } from "./token/use-wrap-eth";
export { useShieldETH } from "./token/use-shield-eth";
export { useUnwrap, unwrapMutationOptions, type UnwrapParams } from "./token/use-unwrap";
export { useUnwrapAll, unwrapAllMutationOptions } from "./token/use-unwrap-all";
export {
  useFinalizeUnwrap,
  finalizeUnwrapMutationOptions,
  type FinalizeUnwrapParams,
} from "./token/use-finalize-unwrap";
export { useUnshield, unshieldMutationOptions, type UnshieldParams } from "./token/use-unshield";
export { useUnshieldAll, unshieldAllMutationOptions } from "./token/use-unshield-all";
export {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
  underlyingAllowanceQueryKeys,
  underlyingAllowanceQueryOptions,
  type UseUnderlyingAllowanceConfig,
} from "./token/use-underlying-allowance";
export {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./token/balance-query-keys";
export {
  useWrapperDiscovery,
  useWrapperDiscoverySuspense,
  wrapperDiscoveryQueryKeys,
  wrapperDiscoveryQueryOptions,
  type UseWrapperDiscoveryConfig,
  type UseWrapperDiscoverySuspenseConfig,
} from "./token/use-wrapper-discovery";
export {
  useTokenMetadata,
  useTokenMetadataSuspense,
  tokenMetadataQueryKeys,
  tokenMetadataQueryOptions,
  type TokenMetadata,
} from "./token/use-token-metadata";
export {
  useActivityFeed,
  activityFeedQueryKeys,
  type UseActivityFeedConfig,
} from "./token/use-activity-feed";
export {
  useApproveUnderlying,
  approveUnderlyingMutationOptions,
  type ApproveUnderlyingParams,
} from "./token/use-approve-underlying";
export {
  useIsConfidential,
  useIsConfidentialSuspense,
  isConfidentialQueryKeys,
  isConfidentialQueryOptions,
  useIsWrapper,
  useIsWrapperSuspense,
  isWrapperQueryKeys,
  isWrapperQueryOptions,
} from "./token/use-is-confidential";
export {
  useTotalSupply,
  useTotalSupplySuspense,
  totalSupplyQueryKeys,
  totalSupplyQueryOptions,
} from "./token/use-total-supply";
export {
  useWrapFee,
  useUnwrapFee,
  useBatchTransferFee,
  useFeeRecipient,
  wrapFeeQueryOptions,
  unwrapFeeQueryOptions,
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  feeQueryKeys,
  type UseFeeConfig,
} from "./token/use-fees";

// Re-export event decoders, types, and constants from core SDK
export { ZERO_HANDLE } from "@zama-fhe/sdk";
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrappedEvent,
  UnwrapRequestedEvent,
  UnwrappedFinalizedEvent,
  UnwrappedStartedEvent,
  TokenEvent,
} from "@zama-fhe/sdk";
export {
  Topics,
  TOKEN_TOPICS,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrappedFinalized,
  decodeUnwrappedStarted,
  decodeTokenEvent,
  decodeTokenEvents,
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
  GenericStringStorage,
  ContractCallConfig,
  TransactionReceipt,
} from "@zama-fhe/sdk";
export {
  TokenError,
  TokenErrorCode,
  InvalidCredentialsError,
  NoCiphertextError,
  RelayerRequestFailedError,
} from "@zama-fhe/sdk";
