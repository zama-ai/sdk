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
export { createConfig, cleartext, resolveChainRelayers, resolveStorage } from "./config";
export type {
  ZamaConfig,
  ZamaConfigBase,
  ZamaConfigGeneric,
  ZamaConfigViem,
  ZamaConfigEthers,
  RelayerConfig,
  CleartextRelayerConfig,
  AtLeastOneChain,
  ResolvedChainRelayer,
} from "./config";
export type { RelayerRouter } from "./relayer/relayer-router";
export type { RelayerSDK } from "./relayer/types";
export type {
  RelayerSDKStatus,
  EncryptResult,
  EncryptParams,
  EncryptInput,
  EncryptedValue,
  ClearValue,
  EIP712TypedData,
  NetworkType,
  FheEncryptionKey,
  FheTypeName,
} from "./relayer/types";

// Decrypt parameter/result types — aligned with the canonical Zama glossary.
// Re-exported from the underlying relayer types under their glossary names.
export type {
  UserDecryptParams as DecryptValuesParams,
  PublicDecryptResult as DecryptPublicValuesResult,
  DelegatedUserDecryptParams as DelegatedDecryptValuesParams,
} from "./relayer/types";
export type { GenericLogger } from "./types/logger";

// Chain presets and types
export {
  mainnet,
  sepolia,
  hoodi,
  ingenTestnet,
  bscTestnet,
  hardhat,
  anvil,
  chains,
} from "./chains";
export type { FheChain } from "./chains/types";

// ERC-165 interface IDs
export {
  ERC1363_INTERFACE_ID,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
} from "./contracts";

// Token abstraction layer
export { ZamaSDK } from "./zama-sdk";
export { Permits, Delegations, Decryption } from "./namespaces";
export type { EncryptedInput as DecryptInput, DecryptResult } from "./query/user-decrypt";
export type { BatchDecryptItem, BatchDecryptResult } from "./services/decryption-service";
export { WrappersRegistry, DefaultRegistryAddresses } from "./wrappers-registry";
export type { WrappersRegistryConfig, ListPairsOptions } from "./wrappers-registry";
export {
  Token,
  WrappedToken,
  type BatchBalancesResult,
  type BatchDecryptAsOptions,
  savePendingUnshield,
  loadPendingUnshield,
  loadPendingUnshieldRequest,
  clearPendingUnshield,
  type PendingUnshieldRequest,
} from "./token";
export { ZERO_ENCRYPTED_VALUE, isEncryptedValueZero } from "./utils/handles";
export {
  MemoryStorage,
  memoryStorage,
  IndexedDBStorage,
  indexedDBStorage,
  ChromeSessionStorage,
  chromeSessionStorage,
} from "./storage";
export type { TransportKeyPair, StoredTransportKeyPair, Permission } from "./credentials";
export type {
  GenericSigner,
  GenericProvider,
  GenericStorage,
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
  ShieldCallbacks,
  ShieldOptions,
  ShieldPath,
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
  SetOperatorSubmittedEvent,
  ApproveUnderlyingSubmittedEvent,
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
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  TransactionRevertedError,
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  NoCiphertextError,
  RelayerRequestFailedError,
  ConfigurationError,
  ChainMismatchError,
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
} from "./errors";
export { BaseSigner } from "./signer/base-signer";
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
