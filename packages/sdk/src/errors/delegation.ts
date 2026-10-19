import { ZamaError, ZamaErrorCode } from "./base";

// Delegation errors — thrown by SDK pre-flight checks and by delegation
// transaction callsites when they map ACL Solidity revert reasons.

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

/** Delegate address cannot be the wildcard address — it's only valid as `contractAddress`. */
export class DelegationDelegateCannotBeWildcardError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationDelegateCannotBeWildcard, message, options);
    this.name = "DelegationDelegateCannotBeWildcardError";
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

/**
 * Delegation exists on L1 but hasn't propagated to the gateway yet.
 *
 * After calling `delegateForUserDecryption()`, the delegation is recorded on-chain
 * immediately. However, the gateway (deployed on Arbitrum) must sync this state
 * via cross-chain event propagation, which usually completes within ~10 blocks
 * (a few seconds).
 *
 * Calling `decryptBalanceAs` during this window will fail because the gateway's
 * `isHandleDelegatedForUserDecryption()` check reads from its own synced copy
 * of the ACL state, which hasn't been updated yet.
 *
 * **You rarely need to handle this directly:** the delegated-decrypt path rides
 * out the propagation window with a bounded internal retry (~30s), so a decrypt
 * issued right after the grant simply waits for sync. This error only surfaces
 * if the window outlasts the retry budget, or when retries are disabled via
 * `waitForPropagation: false`.
 *
 * **Note:** This error is raised as a best-effort heuristic — when a delegated
 * decryption receives an HTTP 500 from the relayer, the most likely cause is a
 * propagation delay. However, the same status code can occur if the gateway or
 * relayer experiences an unrelated internal error.
 */
export class DelegationNotPropagatedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationNotPropagated, message, options);
    this.name = "DelegationNotPropagatedError";
  }
}
