/**
 * TypeScript SDK for Zama's fhEVM — confidential smart contracts powered by Fully Homomorphic Encryption.
 *
 * Main classes: {@link ZamaSDK}, {@link Token}, {@link ReadonlyToken}, {@link CredentialsManager}, {@link RelayerWeb}.
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
  ClearValueType,
  UserDecryptParams,
  PublicDecryptResult,
  EIP712TypedData,
  DelegatedUserDecryptParams,
  NetworkType,
} from "./relayer/relayer-sdk.types";
// Re-exports from `@zama-fhe/relayer-sdk/bundle`: these types appear in public
// signatures across the SDK (e.g. relayer keypair, EIP-712 payloads, ZK proof
// inputs). They're surfaced here so consumers of `@zama-fhe/sdk` don't need to
// add `@zama-fhe/relayer-sdk` as a direct dependency.
export type {
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

// ERC-165 interface IDs
export { ERC7984_INTERFACE_ID, ERC7984_WRAPPER_INTERFACE_ID } from "./contracts";

// Decrypt cache
export { DecryptCache } from "./decrypt-cache";

// Token abstraction layer
export { ZamaSDK } from "./zama-sdk";
export type { ZamaSDKConfig } from "./zama-sdk";
export type { DecryptHandle, DecryptResult } from "./query/user-decrypt";
export { WrappersRegistry, DefaultRegistryAddresses } from "./wrappers-registry";
export type { WrappersRegistryConfig, ListPairsOptions } from "./wrappers-registry";
export {
  Token,
  ReadonlyToken,
  type BatchBalancesResult,
  type BatchDecryptAsOptions,
  ZERO_HANDLE,
  isZeroHandle,
} from "./token";
export {
  MemoryStorage,
  memoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  ChromeSessionStorage,
  chromeSessionStorage,
} from "./storage";
export {
  CredentialsManager,
  type CredentialsManagerConfig,
  DelegatedCredentialsManager,
  type DelegatedCredentialsManagerConfig,
} from "./credentials";
export type {
  GenericSigner,
  GenericStorage,
  SignerLifecycleCallbacks,
  StoredCredentials,
  DelegatedStoredCredentials,
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
  UnshieldOptions,
  ShieldCallbacks,
  ShieldOptions,
  TransferCallbacks,
  TransferOptions,
} from "./types";
export type { Address, Hex } from "viem";
export { ZamaSDKEvents } from "./events";
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
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
  CredentialsPersistFailedEvent,
  CredentialsCorruptedEvent,
} from "./events";
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
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  BalanceCheckUnavailableError,
  ERC20ReadFailedError,
  type BalanceErrorDetails,
  DelegationDelegateEqualsContractError,
  DelegationExpiryUnchangedError,
  AclPausedError,
  DelegationContractIsSelfError,
  DelegationExpirationTooSoonError,
  DelegationNotPropagatedError,
  matchZamaError,
  matchAclRevert,
} from "./errors";

// Event decoders and types
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
} from "./events";
export {
  Topics,
  AclTopics,
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
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  setOperatorContract,
  underlyingContract,
  inferredTotalSupplyContract,
  wrapContract,
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
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
  isHandleDelegatedContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  getTokenPairContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  isConfidentialTokenValidContract,
} from "./contracts";
export type { TokenWrapperPair, TokenWrapperPairWithMetadata, PaginatedResult } from "./contracts";
