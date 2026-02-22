// Provider
export { TokenSDKProvider, useTokenSDK } from "./provider";

// SDK method hooks
export { useEncrypt } from "./relayer/use-encrypt";
export { useUserDecrypt } from "./relayer/use-user-decrypt";
export { usePublicDecrypt } from "./relayer/use-public-decrypt";
export { useGenerateKeypair } from "./relayer/use-generate-keypair";
export { useCreateEIP712 } from "./relayer/use-create-eip712";
export type { CreateEIP712Params } from "./relayer/use-create-eip712";
export { useCreateDelegatedUserDecryptEIP712 } from "./relayer/use-create-delegated-user-decrypt-eip712";
export type { CreateDelegatedUserDecryptEIP712Params } from "./relayer/use-create-delegated-user-decrypt-eip712";
export { useDelegatedUserDecrypt } from "./relayer/use-delegated-user-decrypt";
export { useRequestZKProofVerification } from "./relayer/use-request-zk-proof-verification";
export { usePublicKey, publicKeyQueryKeys, type PublicKeyData } from "./relayer/use-public-key";
export {
  usePublicParams,
  publicParamsQueryKeys,
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
} from "@zama-fhe/token-sdk";

// Re-export core types
export type {
  RelayerSDK,
  RelayerWebConfig,
  TokenSDKConfig,
  TokenConfig,
  ReadonlyTokenConfig,
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
} from "@zama-fhe/token-sdk";

// Re-export network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "@zama-fhe/token-sdk";

// Re-export constants
export { ERC7984_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID } from "@zama-fhe/token-sdk";

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
} from "@zama-fhe/token-sdk";

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
} from "@zama-fhe/token-sdk";

// Token hooks
export { useToken, type UseTokenConfig } from "./token/use-token";
export { useReadonlyToken } from "./token/use-readonly-token";
export {
  useConfidentialBalance,
  type UseConfidentialBalanceOptions,
} from "./token/use-confidential-balance";
export {
  useConfidentialBalances,
  type UseConfidentialBalancesOptions,
} from "./token/use-confidential-balances";
export { useAuthorizeAll } from "./token/use-authorize-all";
export {
  useConfidentialTransfer,
  type ConfidentialTransferParams,
} from "./token/use-confidential-transfer";
export {
  useConfidentialTransferFrom,
  type ConfidentialTransferFromParams,
} from "./token/use-confidential-transfer-from";
export {
  useConfidentialApprove,
  type ConfidentialApproveParams,
} from "./token/use-confidential-approve";
export {
  useConfidentialIsApproved,
  useConfidentialIsApprovedSuspense,
  confidentialIsApprovedQueryKeys,
} from "./token/use-confidential-is-approved";
export { useWrap, type WrapParams } from "./token/use-wrap";
export { useShield } from "./token/use-shield";
export { useWrapETH, type WrapETHParams } from "./token/use-wrap-eth";
export { useShieldETH } from "./token/use-shield-eth";
export { useUnwrap, type UnwrapParams } from "./token/use-unwrap";
export { useUnwrapAll } from "./token/use-unwrap-all";
export { useFinalizeUnwrap, type FinalizeUnwrapParams } from "./token/use-finalize-unwrap";
export { useUnshield, type UnshieldParams } from "./token/use-unshield";
export { useUnshieldAll } from "./token/use-unshield-all";
export {
  useUnderlyingAllowance,
  useUnderlyingAllowanceSuspense,
  underlyingAllowanceQueryKeys,
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
  type UseWrapperDiscoveryConfig,
  type UseWrapperDiscoverySuspenseConfig,
} from "./token/use-wrapper-discovery";
export {
  useTokenMetadata,
  useTokenMetadataSuspense,
  tokenMetadataQueryKeys,
  type TokenMetadata,
} from "./token/use-token-metadata";
export {
  useActivityFeed,
  activityFeedQueryKeys,
  type UseActivityFeedConfig,
} from "./token/use-activity-feed";
export { useApproveUnderlying, type ApproveUnderlyingParams } from "./token/use-approve-underlying";
export {
  useIsConfidential,
  useIsConfidentialSuspense,
  isConfidentialQueryKeys,
  useIsWrapper,
  useIsWrapperSuspense,
  isWrapperQueryKeys,
} from "./token/use-is-confidential";
export {
  useTotalSupply,
  useTotalSupplySuspense,
  totalSupplyQueryKeys,
} from "./token/use-total-supply";
export {
  useWrapFee,
  useUnwrapFee,
  useBatchTransferFee,
  useFeeRecipient,
  feeQueryKeys,
  type UseFeeConfig,
} from "./token/use-fees";

// Re-export event decoders, types, and constants from core SDK
export { ZERO_HANDLE } from "@zama-fhe/token-sdk";
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrappedEvent,
  UnwrapRequestedEvent,
  UnwrappedFinalizedEvent,
  UnwrappedStartedEvent,
  TokenEvent,
} from "@zama-fhe/token-sdk";
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
} from "@zama-fhe/token-sdk";

// Re-export activity feed types and helpers from core SDK
export type {
  ActivityDirection,
  ActivityType,
  ActivityAmount,
  ActivityLogMetadata,
  ActivityItem,
} from "@zama-fhe/token-sdk";
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/token-sdk";

// Re-export token types from core SDK
export type {
  Hex,
  GenericSigner,
  GenericStringStorage,
  ContractCallConfig,
  TransactionReceipt,
} from "@zama-fhe/token-sdk";
export { TokenError, TokenErrorCode } from "@zama-fhe/token-sdk";
