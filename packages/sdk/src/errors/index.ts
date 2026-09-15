export { ZamaError, ZamaErrorCode, isRetryable, retryAfterSeconds } from "./base";
export { matchZamaError, type ErrorForCode } from "./match";
export { SigningRejectedError, SigningFailedError, type SigningErrorMetadata } from "./signing";
export {
  EncryptionFailedError,
  DecryptionFailedError,
  EncryptOffloadUnavailableError,
} from "./encryption";
export { TransactionRevertedError } from "./transaction";
export {
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  RevokedKmsContextError,
  NoCiphertextError,
  KeyWrappingError,
  TransportKeyPairChangedError,
  PreparedPermitChainMismatchError,
  PreparedPermitExpiredError,
} from "./credential";
export { RelayerRequestFailedError, ConfigurationError } from "./relayer";
export { NotEntitledError } from "./entitlement";
export { RpcRateLimitError } from "./rpc";
export { ChainMismatchError } from "./chain";
export {
  SignerRequiredError,
  SignerNotConfiguredError,
  WalletNotConnectedError,
  WalletAccountNotReadyError,
  requireConfigured,
} from "./signer";
export {
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationDelegateEqualsContractError,
  DelegationContractIsSelfError,
  AclPausedError,
  DelegationExpirationTooSoonError,
  DelegationNotPropagatedError,
} from "./delegation";
export {
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  InsufficientAllowanceError,
  BalanceCheckUnavailableError,
  ERC20ReadFailedError,
  type BalanceErrorDetails,
} from "./balance";
export { UnshieldAlreadyFinalizedError, type UnshieldAlreadyFinalizedDetails } from "./unshield";
export { wrapDecryptError, type DecryptErrorContext } from "./decrypt";
export { wrapEncryptError } from "./encrypt";
export { isFatalBatchError } from "./fatal-batch";
