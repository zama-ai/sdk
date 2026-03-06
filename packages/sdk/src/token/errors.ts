/**
 * Typed error codes thrown by the SDK.
 * Use `error.code` or `instanceof` to programmatically handle specific failure modes.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0xTo", 100n);
 * } catch (e) {
 *   if (e instanceof SigningRejectedError) {
 *     // User rejected the wallet signature
 *   }
 * }
 * ```
 */
export const ZamaErrorCode = {
  /** User rejected the wallet signature prompt. */
  SigningRejected: "SIGNING_REJECTED",
  /** Wallet signature failed for a reason other than rejection. */
  SigningFailed: "SIGNING_FAILED",
  /** FHE encryption failed. */
  EncryptionFailed: "ENCRYPTION_FAILED",
  /** FHE decryption failed. */
  DecryptionFailed: "DECRYPTION_FAILED",
  /** ERC-20 approval transaction failed. */
  ApprovalFailed: "APPROVAL_FAILED",
  /** On-chain transaction reverted. */
  TransactionReverted: "TRANSACTION_REVERTED",
  /** FHE keypair has expired and needs regeneration. */
  KeypairExpired: "KEYPAIR_EXPIRED",
  /** Relayer rejected FHE keypair (stale, expired, or malformed). */
  InvalidKeypair: "INVALID_KEYPAIR",
  /** No FHE ciphertext exists for this account (never shielded). */
  NoCiphertext: "NO_CIPHERTEXT",
  /** Relayer HTTP request failed. */
  RelayerRequestFailed: "RELAYER_REQUEST_FAILED",
  /** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
  Configuration: "CONFIGURATION",
  /** Delegation cannot target self (delegate === msg.sender). */
  DelegationSelfNotAllowed: "DELEGATION_SELF_NOT_ALLOWED",
  /** Only one delegate/revoke per (delegator, delegate, contract) per block. */
  DelegationCooldown: "DELEGATION_COOLDOWN",
  /** No active delegation found for this (delegator, delegate, contract) tuple. */
  DelegationNotFound: "DELEGATION_NOT_FOUND",
  /** The delegation has expired. */
  DelegationExpired: "DELEGATION_EXPIRED",
} as const;

/** Union of all {@link ZamaErrorCode} string values. */
export type ZamaErrorCode = (typeof ZamaErrorCode)[keyof typeof ZamaErrorCode];

/**
 * Base error thrown by all SDK operations.
 * Carries a {@link ZamaErrorCode} for programmatic error handling.
 * Prefer catching specific subclasses (e.g. {@link EncryptionFailedError}).
 */
export class ZamaError extends Error {
  /** Machine-readable error code. */
  readonly code: ZamaErrorCode;

  constructor(code: ZamaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZamaError";
    this.code = code;
  }
}

/** User rejected the wallet signature prompt. */
export class SigningRejectedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.SigningRejected, message, options);
    this.name = "SigningRejectedError";
  }
}

/** Wallet signature failed for a reason other than rejection. */
export class SigningFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.SigningFailed, message, options);
    this.name = "SigningFailedError";
  }
}

/** FHE encryption failed. */
export class EncryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.EncryptionFailed, message, options);
    this.name = "EncryptionFailedError";
  }
}

/** FHE decryption failed. */
export class DecryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DecryptionFailed, message, options);
    this.name = "DecryptionFailedError";
  }
}

/** ERC-20 approval transaction failed. */
export class ApprovalFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.ApprovalFailed, message, options);
    this.name = "ApprovalFailedError";
  }
}

/** On-chain transaction reverted. */
export class TransactionRevertedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}

/** FHE keypair has expired and needs regeneration. */
export class KeypairExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.KeypairExpired, message, options);
    this.name = "KeypairExpiredError";
  }
}

/** Relayer rejected FHE keypair (stale, expired, or malformed). */
export class InvalidKeypairError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidKeypair, message, options);
    this.name = "InvalidKeypairError";
  }
}

/** No FHE ciphertext exists for this account (never shielded). */
export class NoCiphertextError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.NoCiphertext, message, options);
    this.name = "NoCiphertextError";
  }
}

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends ZamaError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(ZamaErrorCode.RelayerRequestFailed, message, options);
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
  }
}

/** SDK configuration is invalid (e.g. forbidden chain ID, unsupported type). */
export class ConfigurationError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.Configuration, message, options);
    this.name = "ConfigurationError";
  }
}

// Delegation errors — mapped from ACL contract reverts by higher-level consumers.
// The SDK exports them so dApp code can `instanceof`-check without hardcoding strings.

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
 * Pattern-match on a {@link ZamaError} by its error code.
 * Falls through to the `_` wildcard handler if no specific handler matches.
 * Returns `undefined` if the error is not a `ZamaError` and no `_` handler is provided.
 *
 * @example
 * ```ts
 * matchZamaError(error, {
 *   SIGNING_REJECTED: () => toast("Please approve in wallet"),
 *   TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
 *   _: () => toast("Unknown error"),
 * });
 * ```
 */
export function matchZamaError<R>(
  error: unknown,
  handlers: Partial<Record<ZamaErrorCode, (error: ZamaError) => R>> & {
    _?: (error: unknown) => R;
  },
): R | undefined {
  if (error instanceof ZamaError) {
    const handler = handlers[error.code];
    if (handler) return handler(error);
  }
  return handlers._?.(error);
}
