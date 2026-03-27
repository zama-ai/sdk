import { ZamaError, ZamaErrorCode } from "./base";

// Delegation errors — the SDK does NOT auto-map ACL contract reverts to these.
// They are exported so dApp code can catch and re-throw them when parsing
// on-chain revert reasons (e.g. via viem's `decodeErrorResult`).

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

/**
 * Delegation exists on L1 but hasn't propagated to the gateway yet.
 *
 * After calling `delegateForUserDecryption()`, the delegation is recorded on-chain
 * immediately. However, the gateway (deployed on Arbitrum) must sync this state
 * via cross-chain event propagation, which typically takes 1–2 minutes.
 *
 * Calling `decryptBalanceAs` during this window will fail because the gateway's
 * `isHandleDelegatedForUserDecryption()` check reads from its own synced copy
 * of the ACL state, which hasn't been updated yet.
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
