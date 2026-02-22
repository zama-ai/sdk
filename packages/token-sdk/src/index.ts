// Core SDK
export { RelayerWeb } from "./relayer/relayer-web";
export type { RelayerSDK } from "./relayer/relayer-sdk";
export type {
  Address,
  RelayerWebConfig,
  RelayerSDKStatus,
  EncryptResult,
  EncryptParams,
  UserDecryptParams,
  PublicDecryptResult,
  FHEKeypair,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  NetworkType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
  InputProofBytesType,
  FhevmInstanceConfig,
} from "./relayer/relayer-sdk.types";

// Network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "./relayer/relayer-utils";

// ABIs
export { ERC20_ABI, ERC20_METADATA_ABI } from "./abi/erc20.abi";
export { DEPLOYMENT_COORDINATOR_ABI } from "./abi/deployment-coordinator.abi";
export { ERC165_ABI } from "./abi/erc165.abi";
export { ENCRYPTION_ABI } from "./abi/encryption.abi";
export { FEE_MANAGER_ABI } from "./abi/fee-manager.abi";
export { TRANSFER_BATCHER_ABI } from "./abi/transfer-batch.abi";
export { WRAPPER_ABI } from "./abi/wrapper.abi";
export { BATCH_SWAP_ABI } from "./abi/batch-swap.abi";

// ERC-165 interface IDs
export { ERC7984_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID } from "./contracts";

// Token abstraction layer
export { TokenSDK } from "./token/token-sdk";
export type { TokenSDKConfig } from "./token/token-sdk";
export { Token } from "./token/token";
export type { TokenConfig } from "./token/token";
export { ReadonlyToken } from "./token/readonly-token";
export type { ReadonlyTokenConfig } from "./token/readonly-token";
export { ZERO_HANDLE } from "./token/readonly-token";
export { MemoryStorage } from "./token/memory-storage";
export { IndexedDBStorage, indexedDBStorage } from "./token/indexeddb-storage";
export { CredentialsManager } from "./token/credential-manager";
export type {
  GenericSigner,
  GenericStringStorage,
  StoredCredentials,
  ContractCallConfig,
  TransactionReceipt,
} from "./token/token.types";
export { TokenError, TokenErrorCode } from "./token/token.types";

// Event decoders and types
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrappedEvent,
  UnwrapRequestedEvent,
  UnwrappedFinalizedEvent,
  UnwrappedStartedEvent,
  TokenEvent,
} from "./events";
export {
  CONFIDENTIAL_TRANSFER_TOPIC,
  WRAPPED_TOPIC,
  UNWRAP_REQUESTED_TOPIC,
  UNWRAPPED_FINALIZED_TOPIC,
  UNWRAPPED_STARTED_TOPIC,
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
} from "./events";

// Activity feed helpers and types
export type {
  ActivityDirection,
  ActivityType,
  ActivityAmount,
  ActivityLogMetadata,
  ActivityItem,
} from "./activity";
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "./activity";

// Contract call builders
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
} from "./contracts";
export type { BatchTransferData } from "./contracts";
