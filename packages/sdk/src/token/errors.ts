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
  /** FHE credentials have expired and need regeneration. */
  CredentialExpired: "CREDENTIAL_EXPIRED",
  /** Relayer rejected credentials (stale, expired, or malformed). */
  InvalidCredentials: "INVALID_CREDENTIALS",
  /** No FHE ciphertext exists for this account (never shielded). */
  NoCiphertext: "NO_CIPHERTEXT",
  /** Relayer HTTP request failed. */
  RelayerRequestFailed: "RELAYER_REQUEST_FAILED",
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

/** FHE credentials have expired and need regeneration. */
export class CredentialExpiredError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.CredentialExpired, message, options);
    this.name = "CredentialExpiredError";
  }
}

/** Relayer rejected credentials (stale, expired, or malformed). */
export class InvalidCredentialsError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.InvalidCredentials, message, options);
    this.name = "InvalidCredentialsError";
  }
}

/** No FHE ciphertext exists for this account (never shielded). */
export class NoCiphertextError extends TokenError {
  constructor(message: string, options?: ErrorOptions) {
    super(TokenErrorCode.NoCiphertext, message, options);
    this.name = "NoCiphertextError";
  }
}

/** Relayer HTTP request failed. */
export class RelayerRequestFailedError extends TokenError {
  /** HTTP status code from the relayer, if available. */
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(TokenErrorCode.RelayerRequestFailed, message, options);
    this.name = "RelayerRequestFailedError";
    this.statusCode = statusCode;
  }
}

/**
 * Pattern-match on a {@link TokenError} by its error code.
 * Falls through to the `_` wildcard handler if no specific handler matches.
 * Returns `undefined` if the error is not a `TokenError` and no `_` handler is provided.
 *
 * @example
 * ```ts
 * matchTokenError(error, {
 *   SIGNING_REJECTED: () => toast("Please approve in wallet"),
 *   TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
 *   _: () => toast("Unknown error"),
 * });
 * ```
 */
export function matchTokenError<R>(
  error: unknown,
  handlers: Partial<Record<TokenErrorCode, (error: TokenError) => R>> & {
    _?: (error: unknown) => R;
  },
): R | undefined {
  if (error instanceof TokenError) {
    const handler = handlers[error.code];
    if (handler) return handler(error);
  }
  return handlers._?.(error);
}
