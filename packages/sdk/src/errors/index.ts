export { ZamaError, ZamaErrorCode, matchZamaError } from "./base";
export { SigningRejectedError, SigningFailedError } from "./signing";
export { EncryptionFailedError, DecryptionFailedError } from "./encryption";
export { TransactionRevertedError } from "./transaction";
export {
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  NoCiphertextError,
} from "./credential";
export { RelayerRequestFailedError, ConfigurationError } from "./relayer";
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
  BalanceCheckUnavailableError,
  ERC20ReadFailedError,
  type BalanceErrorDetails,
} from "./balance";
export { wrapDecryptError } from "./decrypt";
export { wrapEncryptError } from "./encrypt";
export { isFatalBatchError } from "./fatal-batch";
