/**
 * Core SDK for confidential token operations using Fully Homomorphic Encryption.
 *
 * Main classes: {@link ZamaSDK}, {@link Token}, {@link ReadonlyToken}, {@link RelayerWeb}.
 *
 * @packageDocumentation
 */

// Core SDK
export { RelayerWeb } from "./relayer/relayer-web";
export type { RelayerSDK } from "./relayer/relayer-sdk";
export type {
  RelayerWebConfig,
  RelayerWebSecurityConfig,
  RelayerSDKStatus,
  EncryptResult,
  EncryptParams,
  EncryptInput,
  Handle,
  UserDecryptParams,
  PublicDecryptResult,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  NetworkType,
} from "./relayer/relayer-sdk.types";
export type {
  ClearValueType,
  FheTypeName,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
  InputProofBytesType,
  FhevmInstanceConfig,
} from "@zama-fhe/relayer-sdk/bundle";
export type { GenericLogger } from "./worker/worker.types";

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
export { ZamaSDK } from "./token/zama-sdk";
export type { ZamaSDKConfig } from "./token/zama-sdk";
export { Token } from "./token/token";
export type { TokenConfig } from "./token/token";
export { ReadonlyToken } from "./token/readonly-token";
export type { ReadonlyTokenConfig, BatchDecryptOptions } from "./token/readonly-token";
export { ZERO_HANDLE } from "./token/readonly-token";
export { MemoryStorage, memoryStorage } from "./token/memory-storage";
export { IndexedDBStorage, indexedDBStorage } from "./token/indexeddb-storage";
export { ChromeSessionStorage, chromeSessionStorage } from "./token/chrome-session-storage";
export { CredentialsManager } from "./token/credentials-manager";
export type { CredentialsManagerConfig } from "./token/credentials-manager";
export {
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "./token/pending-unshield";
export type { PendingUnshieldScope } from "./token/pending-unshield";
export type {
  Address,
  Hex,
  GenericSigner,
  GenericStorage,
  SignerLifecycleCallbacks,
  StoredCredentials,
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
  UnshieldCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
} from "./token/token.types";
export { ZamaSDKEvents } from "./events/sdk-events";
export type {
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
} from "./events/sdk-events";
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
  ConfigurationError,
  matchZamaError,
} from "./token/errors";

// Event decoders and types
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrappedEvent,
  UnwrapRequestedEvent,
  UnwrappedFinalizedEvent,
  UnwrappedStartedEvent,
  OnChainEvent,
} from "./events/onchain-events";
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
} from "./events/onchain-events";

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
  FHE_GAS_LIMIT,
} from "./contracts";
export type { BatchTransferData } from "./contracts";
