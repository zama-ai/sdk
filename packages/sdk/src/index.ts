/**
 * TypeScript SDK for Zama's fhEVM — confidential smart contracts powered by Fully Homomorphic Encryption.
 *
 * Main classes: {@link ZamaSDK}, {@link Token}, {@link WrappedToken}.
 *
 * @packageDocumentation
 */

// Config factory
// Note: web() and node() transport factories live in their own entry points
// (@zama-fhe/sdk/web and @zama-fhe/sdk/node) to keep environment-specific
// dependencies out of this barrel.
export { createConfig, cleartext } from "./config";
export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigGeneric,
  ZamaConfigViem,
  ZamaConfigEthers,
  RelayerConfig,
  CleartextRelayerConfig,
  AtLeastOneChain,
} from "./config";
export type {
  EncryptResult,
  EncryptParams,
  EncryptInput,
  EncryptedValue,
  ClearValue,
  EIP712TypedData,
  TypedValue,
  DecryptValuesParameters,
  RelayerOptions,
  FhevmRelayerOptions,
  FhevmRuntimeConfig,
  FhevmClientOptions,
  FhevmClient,
  RelayerSDK,
} from "./relayer/types";

// Decrypt parameter/result types — aligned with the canonical Zama glossary.
// Re-exported from the underlying relayer types under their glossary names.
export type { DecryptPublicValuesResult } from "./relayer/types";
export type { GenericLogger } from "./types/logger";

// Chain presets and types
export {
  mainnet,
  sepolia,
  polygonAmoy,
  hoodi,
  ingenTestnet,
  bscTestnet,
  hardhat,
  anvil,
  chains,
} from "./chains";
export type { FheChain, FheChainAuth } from "./chains/types";

// ERC-165 interface IDs
export {
  ERC1363_INTERFACE_ID,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
} from "./contracts";

// Token abstraction layer
export { ZamaSDK } from "./zama-sdk";
export { Permits, Delegations, Decryption, Offline } from "./namespaces";
export type { EncryptedInput as DecryptInput, DecryptResult } from "./query/user-decrypt";
export type {
  BatchDecryptItem,
  BatchDecryptResult,
  DelegatedDecryptOptions,
} from "./services/decryption-service";
export type { DelegationStatus } from "./services/delegation-service";
export { WrappersRegistry, DefaultRegistryAddresses } from "./wrappers-registry";
export type { WrappersRegistryConfig, ListPairsOptions } from "./wrappers-registry";
export { Token, WrappedToken, type BatchBalancesResult, type BatchDecryptAsOptions } from "./token";
export { ZERO_ENCRYPTED_VALUE, isEncryptedValueZero } from "./utils/handles";
export {
  MemoryStorage,
  memoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  ChromeSessionStorage,
  chromeSessionStorage,
} from "./storage";
export type { SerializedTransportKeyPair, Permission, ChecksummedAddress } from "./credentials";
export type { SerializedPermit, SerializedPermitEip712 } from "./credentials/types";
export type {
  GenericSigner,
  GenericProvider,
  GenericStorage,
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  PreparedFor,
  PreparedTransaction,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransactionKind,
  PrepareTransactionRequest,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
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
  ApprovalStrategy,
  UnshieldCallbacks,
  UnshieldOptions,
  UnwrapResult,
  ShieldCallbacks,
  ShieldOptions,
  ShieldPath,
  TransferCallbacks,
  TransferOptions,
  WrapOptions,
} from "./types";
export type { Address, Hex } from "viem";
export { ZamaSDKEvents } from "./events";
export type {
  ZamaSDKEventType,
  ZamaSDKEvent,
  ZamaSDKEventListener,
  BaseEvent,
  ShieldSubmittedEvent,
  TransferSubmittedEvent,
  TransferFromSubmittedEvent,
  SetOperatorSubmittedEvent,
  ApproveUnderlyingSubmittedEvent,
  WrapSubmittedEvent,
  UnwrapSubmittedEvent,
  FinalizeUnwrapSubmittedEvent,
  UnshieldPhase1SubmittedEvent,
  UnshieldPhase2StartedEvent,
  UnshieldPhase2SubmittedEvent,
  TransactionErrorEvent,
  TransactionOperation,
  EncryptStartEvent,
  EncryptEndEvent,
  EncryptErrorEvent,
  DecryptStartEvent,
  DecryptEndEvent,
  DecryptErrorEvent,
  DelegationSubmittedEvent,
  RevokeDelegationSubmittedEvent,
} from "./events";
export {
  ZamaError,
  ZamaErrorCode,
  isRetryable,
  retryAfterSeconds,
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  TransactionRevertedError,
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  NotEntitledError,
  RpcRateLimitError,
  ConfigurationError,
  ChainMismatchError,
  PreparedChainMismatchError,
  SignerRequiredError,
  SignerNotConfiguredError,
  WalletNotConnectedError,
  WalletAccountNotReadyError,
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  InsufficientAllowanceError,
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
  type ErrorForCode,
} from "./errors";
export { BaseSigner } from "./signer/base-signer";
export type { OfflineSigningOptions } from "./services/offline-signing-service";
export { createWalletAccountStore, MutableWalletAccountStore } from "./signer/wallet-account-store";

// Event decoders and types
export type {
  RawLog,
  ConfidentialTransferEvent,
  WrapEvent,
  UnwrapRequestedEvent,
  UnwrapFinalizedEvent,
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
  decodeWrap,
  decodeUnwrapRequested,
  decodeUnwrapFinalized,
  decodeOnChainEvent,
  decodeOnChainEvents,
  findUnwrapRequested,
  findWrap,
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
  transferAndCallContract,
  nameContract,
  symbolContract,
  decimalsContract,
  balanceOfContract,
  allowanceContract,
  approveContract,
  confidentialTotalSupplyContract,
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
