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
export const TokenErrorCode = {
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
} as const;

/** Union of all {@link TokenErrorCode} string values. */
export type TokenErrorCode = (typeof TokenErrorCode)[keyof typeof TokenErrorCode];

/**
 * Base error thrown by all SDK operations.
 * Carries a {@link TokenErrorCode} for programmatic error handling.
 * Prefer catching specific subclasses (e.g. {@link EncryptionFailedError}).
 */
export class TokenError extends Error {
  /** Machine-readable error code. */
  readonly code: TokenErrorCode;

  constructor(code: TokenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TokenError";
    this.code = code;
  }
}

/** User rejected the wallet signature prompt. */
export class SigningRejectedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.SigningRejected, message, options);
    this.name = "SigningRejectedError";
  }
}

/** Wallet signature failed for a reason other than rejection. */
export class SigningFailedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.SigningFailed, message, options);
    this.name = "SigningFailedError";
  }
}

/** FHE encryption failed. */
export class EncryptionFailedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.EncryptionFailed, message, options);
    this.name = "EncryptionFailedError";
  }
}

/** FHE decryption failed. */
export class DecryptionFailedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.DecryptionFailed, message, options);
    this.name = "DecryptionFailedError";
  }
}

/** ERC-20 approval transaction failed. */
export class ApprovalFailedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.ApprovalFailed, message, options);
    this.name = "ApprovalFailedError";
  }
}

/** On-chain transaction reverted. */
export class TransactionRevertedError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}
