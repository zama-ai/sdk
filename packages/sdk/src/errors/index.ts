export { ZamaError, ZamaErrorCode, matchZamaError } from "./base";
export { SigningRejectedError, SigningFailedError } from "./signing";
export { EncryptionFailedError, DecryptionFailedError } from "./encryption";
export { ApprovalFailedError, TransactionRevertedError } from "./transaction";
export { KeypairExpiredError, InvalidKeypairError, NoCiphertextError } from "./credential";
export { RelayerRequestFailedError, ConfigurationError } from "./relayer";
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
export { matchAclRevert } from "./acl-revert";
