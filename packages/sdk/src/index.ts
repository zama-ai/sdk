/**
 * TypeScript SDK for Zama's fhEVM — confidential smart contracts powered by Fully Homomorphic Encryption.
 *
 * Main classes: {@link ZamaSDK}, {@link Token}, {@link ReadonlyToken}, {@link CredentialsManager}, {@link RelayerWeb}.
 *
 * @packageDocumentation
 */

// Config factory
// Note: node() transport factory is exported from @zama-fhe/sdk/node instead,
// keeping node:worker_threads out of the main browser entry.
export { buildZamaConfig, web, cleartext, resolveChainTransports, resolveStorage } from "./config";
export type { CreateRelayerFn } from "./config/transports";
export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigViem,
  ZamaConfigEthers,
  TransportConfig,
  WebTransportConfig,
  NodeTransportConfig,
  CleartextTransportConfig,
} from "./config";

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
  PublicKeyData,
  PublicParamsData,
} from "./relayer/relayer-sdk.types";
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
export {
  DefaultConfigs,
  HardhatConfig,
  MainnetConfig,
  SepoliaConfig,
} from "./relayer/relayer-utils";
export type { ExtendedFhevmInstanceConfig } from "./relayer/relayer-utils";
export type { FheChain } from "./chains/types";

// ERC-165 interface IDs
export {
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID_LEGACY,
} from "./contracts";

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
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
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
