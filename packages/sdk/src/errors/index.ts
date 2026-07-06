export { ZamaError, ZamaErrorCode } from "./base";
export { matchZamaError } from "./match";
export { SigningRejectedError, SigningFailedError } from "./signing";
export { EncryptionFailedError, DecryptionFailedError } from "./encryption";
export { TransactionRevertedError } from "./transaction";
export {
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
  NoCiphertextError,
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
  SignerCapabilityError,
  SignerAddressMismatchError,
  requireConfigured,
} from "./signer";
export type { SignerCapability } from "./signer";
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
export { wrapDecryptError, type DecryptErrorContext } from "./decrypt";
export { wrapEncryptError } from "./encrypt";
export { isFatalBatchError } from "./fatal-batch";
