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
export { cleartext, createConfig } from "./config";
export type {
  AtLeastOneChain,
  CleartextRelayerConfig,
  RelayerConfig,
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigEthers,
  ZamaConfigGeneric,
  ZamaConfigViem,
} from "./config";
export type {
  ClearValue,
  DecryptValuesParameters,
  EIP712TypedData,
  EncryptedValue,
  EncryptInput,
  EncryptParams,
  EncryptResult,
  FhevmClient,
  FhevmClientOptions,
  FhevmRelayerOptions,
  FhevmRuntimeConfig,
  RelayerOptions,
  RelayerSDK,
  TypedValue,
} from "./relayer/types";

// Decrypt parameter/result types — aligned with the canonical Zama glossary.
// Re-exported from the underlying relayer types under their glossary names.
export type { DecryptPublicValuesResult } from "./relayer/types";
export type { GenericLogger } from "./types/logger";

// Chain presets and types
export {
  anvil,
  bscTestnet,
  chains,
  hardhat,
  hoodi,
  ingenTestnet,
  mainnet,
  polygonAmoy,
  sepolia,
} from "./chains";
export type { FheChain, FheChainAuth } from "./chains/types";

// ERC-165 interface IDs
export {
  ERC1363_INTERFACE_ID,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
} from "./contracts";

// Token abstraction layer
export type { Address, Hex } from "viem";
export type { ChecksummedAddress, Permission, SerializedTransportKeyPair } from "./credentials";
export type { SerializedPermit, SerializedPermitEip712 } from "./credentials/types";
export {
  AclPausedError,
  BalanceCheckUnavailableError,
  ChainMismatchError,
  ConfigurationError,
  DecryptionFailedError,
  DelegationContractIsSelfError,
  DelegationCooldownError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationNotPropagatedError,
  DelegationSelfNotAllowedError,
  EncryptionFailedError,
  ERC20ReadFailedError,
  InsufficientAllowanceError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  InvalidTransportKeyPairError,
  isRetryable,
  matchZamaError,
  NoCiphertextError,
  NotEntitledError,
  RelayerRequestFailedError,
  retryAfterSeconds,
  RpcRateLimitError,
  SignerNotConfiguredError,
  SignerRequiredError,
  SigningFailedError,
  SigningRejectedError,
  TransactionRevertedError,
  TransportKeyPairExpiredError,
  WalletAccountNotReadyError,
  WalletNotConnectedError,
  ZamaError,
  ZamaErrorCode,
  type BalanceErrorDetails,
  type ErrorForCode,
} from "./errors";
export { ZamaSDKEvents } from "./events";
export type {
  ApproveUnderlyingSubmittedEvent,
  BaseEvent,
  DecryptEndEvent,
  DecryptErrorEvent,
  DecryptStartEvent,
  DelegationSubmittedEvent,
  EncryptEndEvent,
  EncryptErrorEvent,
  EncryptStartEvent,
  FinalizeUnwrapSubmittedEvent,
  RevokeDelegationSubmittedEvent,
  SetOperatorSubmittedEvent,
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
  ZamaSDKEventType,
} from "./events";
export { Decryption, Delegations, Offline, Permits } from "./namespaces";
export type { EncryptedInput as DecryptInput, DecryptResult } from "./query/user-decrypt";
export type {
  BatchDecryptItem,
  BatchDecryptResult,
  DelegatedDecryptOptions,
} from "./services/decryption-service";
export type { DelegationStatus } from "./services/delegation-service";
export { BaseSigner } from "./signer/base-signer";
export { createWalletAccountStore, MutableWalletAccountStore } from "./signer/wallet-account-store";
export {
  ChromeSessionStorage,
  chromeSessionStorage,
  IndexedDBStorage,
  indexedDBStorage,
  MemoryStorage,
  memoryStorage,
} from "./storage";
export { Token, WrappedToken, type BatchBalancesResult, type BatchDecryptAsOptions } from "./token";
export type {
  ApprovalStrategy,
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  ContractAbi,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  GenericProvider,
  GenericSigner,
  GenericStorage,
  PreparedFor,
  PreparedTransaction,
  PrepareFees,
  PrepareOptions,
  PrepareTransactionRequest,
  ReadContractArgs,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  RevokeDelegationRequest,
  SetOperatorRequest,
  ShieldCallbacks,
  ShieldOptions,
  ShieldPath,
  TransactionKind,
  TransactionReceipt,
  TransactionResult,
  TransferAndCallRequest,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
  UnwrapAllRequest,
  UnwrapRequest,
  UnwrapResult,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
  WrapOptions,
  WrapRequest,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "./types";
export { isEncryptedValueZero, ZERO_ENCRYPTED_VALUE } from "./utils/handles";
export { DefaultRegistryAddresses, WrappersRegistry } from "./wrappers-registry";
export type { ListPairsOptions, WrappersRegistryConfig } from "./wrappers-registry";
export { ZamaSDK } from "./zama-sdk";

// Event decoders and types
export {
  ACL_TOPICS,
  AclTopics,
  decodeAclEvent,
  decodeAclEvents,
  decodeConfidentialTransfer,
  decodeDelegatedForUserDecryption,
  decodeOnChainEvent,
  decodeOnChainEvents,
  decodeRevokedDelegationForUserDecryption,
  decodeUnwrapFinalized,
  decodeUnwrapRequested,
  decodeWrap,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
  findUnwrapRequested,
  findWrap,
  TOKEN_TOPICS,
  Topics,
} from "./events";
export type {
  AclEvent,
  ConfidentialTransferEvent,
  DelegatedForUserDecryptionEvent,
  OnChainEvent,
  RawLog,
  RevokedDelegationForUserDecryptionEvent,
  UnwrapFinalizedEvent,
  UnwrapRequestedEvent,
  WrapEvent,
} from "./events";

// Contract call builders
export {
  allowanceContract,
  approveContract,
  balanceOfContract,
  confidentialBalanceOfContract,
  confidentialTotalSupplyContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  decimalsContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  getConfidentialTokenAddressContract,
  getDelegationExpiryContract,
  getTokenAddressContract,
  getTokenPairContract,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  inferredTotalSupplyContract,
  isConfidentialTokenContract,
  isConfidentialTokenValidContract,
  isConfidentialWrapperContract,
  isHandleDelegatedContract,
  isOperatorContract,
  nameContract,
  rateContract,
  revokeDelegationContract,
  setOperatorContract,
  supportsInterfaceContract,
  symbolContract,
  transferAndCallContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "./contracts";
export type { PaginatedResult, TokenWrapperPair, TokenWrapperPairWithMetadata } from "./contracts";
