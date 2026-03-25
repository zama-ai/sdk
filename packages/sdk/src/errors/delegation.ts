import { ZamaError, ZamaErrorCode } from "./base";

// Delegation errors — thrown by SDK pre-flight checks and by `matchAclRevert()`
// when it maps ACL Solidity revert reasons to typed errors.

/** Delegation cannot target self (delegate === msg.sender). */
export class DelegationSelfNotAllowedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationSelfNotAllowed, message, options);
    this.name = "DelegationSelfNotAllowedError";
  }
}

/** Only one delegate/revoke per (delegator, delegate, contract) per block. */
export class DelegationCooldownError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationCooldown, message, options);
    this.name = "DelegationCooldownError";
  }
}

/** No active delegation found for this (delegator, delegate, contract) tuple. */
export class DelegationNotFoundError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationNotFound, message, options);
    this.name = "DelegationNotFoundError";
  }
}

/** The delegation has expired. */
export class DelegationExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationExpired, message, options);
    this.name = "DelegationExpiredError";
  }
}

/** The new expiration date equals the current one. */
export class DelegationExpiryUnchangedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationExpiryUnchanged, message, options);
    this.name = "DelegationExpiryUnchangedError";
  }
}

/** Delegate address cannot be the contract address. */
export class DelegationDelegateEqualsContractError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationDelegateEqualsContract, message, options);
    this.name = "DelegationDelegateEqualsContractError";
  }
}

/** Contract address cannot be the sender address. */
export class DelegationContractIsSelfError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationContractIsSelf, message, options);
    this.name = "DelegationContractIsSelfError";
  }
}

/** The ACL contract is paused. */
export class AclPausedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.AclPaused, message, options);
    this.name = "AclPausedError";
  }
}

/** Expiration date is too soon (must be at least 1 hour in the future). */
export class DelegationExpirationTooSoonError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationExpirationTooSoon, message, options);
    this.name = "DelegationExpirationTooSoonError";
  }
}
