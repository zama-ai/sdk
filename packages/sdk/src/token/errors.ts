/**
 * Machine-readable error codes for all SDK errors.
 * Use with {@link matchZamaError} for exhaustive error handling.
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
  /** The new expiration date equals the current one — no on-chain change needed. */
  DelegationExpiryUnchanged: "DELEGATION_EXPIRY_UNCHANGED",
  /** Delegate address cannot be the contract address. */
  DelegationDelegateEqualsContract: "DELEGATION_DELEGATE_EQUALS_CONTRACT",
  /** Contract address cannot be the sender address. */
  DelegationContractIsSelf: "DELEGATION_CONTRACT_IS_SELF",
  /** The ACL contract is paused. */
  AclPaused: "ACL_PAUSED",
} as const;

export type ZamaErrorCode = (typeof ZamaErrorCode)[keyof typeof ZamaErrorCode];

/**
 * Base class for all typed SDK errors.
 * Prefer catching specific subclasses (e.g. {@link EncryptionFailedError}).
 */
export class ZamaError extends Error {
  /** Machine-readable error code. */
  readonly code: ZamaErrorCode;

  constructor(code: ZamaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "ZamaError";
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

// Delegation errors — the SDK auto-maps ACL contract revert selectors to these
// via matchAclRevert(). They are also exported so dApp code can catch them directly.

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

// ─── Error routing utilities ───────────────────────────────────────────

/**
 * Wrap a wallet signing error as a typed SDK error.
 * Detects EIP-1193 rejection codes and common message patterns.
 */
export function wrapSigningError(error: unknown, context: string): never {
  const isRejected =
    (error instanceof Error && "code" in error && error.code === 4001) ||
    (error instanceof Error &&
      (error.message.includes("rejected") || error.message.includes("denied")));
  if (isRejected) {
    throw new SigningRejectedError(context, { cause: error });
  }
  throw new SigningFailedError(context, {
    cause: error,
  });
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
    if (handler) {
      return handler(error);
    }
  }
  return handlers._?.(error);
}

/** Extract the decoded error name from a viem ContractFunctionRevertedError. */
function extractRevertErrorName(error: unknown): string | null {
  if (
    error instanceof Error &&
    "cause" in error &&
    error.cause !== null &&
    error.cause !== undefined &&
    typeof error.cause === "object" &&
    "data" in error.cause &&
    error.cause.data !== null &&
    error.cause.data !== undefined &&
    typeof error.cause.data === "object" &&
    "errorName" in error.cause.data &&
    typeof error.cause.data.errorName === "string"
  ) {
    return error.cause.data.errorName;
  }
  return null;
}

/** ACL error name → typed SDK error mapping. */
const ACL_ERROR_MAP: Record<string, (cause: Error | undefined) => ZamaError> = {
  AlreadyDelegatedOrRevokedInSameBlock: (cause) =>
    new DelegationCooldownError(
      "Only one delegate/revoke per (delegator, delegate, contract) per block. Wait for the next block before retrying.",
      { cause },
    ),
  SenderCannotBeContractAddress: (cause) =>
    new DelegationContractIsSelfError("The contract address cannot be the caller address.", {
      cause,
    }),
  EnforcedPause: (cause) =>
    new AclPausedError(
      "The ACL contract is paused. Delegation operations are temporarily disabled.",
      { cause },
    ),
  SenderCannotBeDelegate: (cause) =>
    new DelegationSelfNotAllowedError("Cannot delegate to yourself (delegate === msg.sender).", {
      cause,
    }),
  DelegateCannotBeContractAddress: (cause) =>
    new DelegationDelegateEqualsContractError(
      "Delegate address cannot be the same as the contract address.",
      { cause },
    ),
  ExpirationDateBeforeOneHour: (cause) =>
    new ConfigurationError("Expiration date must be at least 1 hour in the future.", { cause }),
  ExpirationDateAlreadySetToSameValue: (cause) =>
    new DelegationExpiryUnchangedError("The new expiration date is the same as the current one.", {
      cause,
    }),
  NotDelegatedYet: (cause) =>
    new DelegationNotFoundError("Cannot revoke: no active delegation exists.", { cause }),
};

/**
 * Map known ACL Solidity revert error names to typed ZamaError subclasses.
 * Prefers viem's structured `error.cause.data.errorName` when available,
 * falling back to string-includes matching on the error message.
 * Returns `null` if the revert reason is not recognized.
 * @internal
 */
export function matchAclRevert(error: unknown): ZamaError | null {
  const cause = error instanceof Error ? error : undefined;

  // Prefer structured error data from viem's ContractFunctionRevertedError
  const errorName = extractRevertErrorName(error);
  if (errorName && errorName in ACL_ERROR_MAP) {
    return ACL_ERROR_MAP[errorName]?.(cause) ?? null;
  }

  // Fallback: string matching for non-viem RPC providers
  const message = error instanceof Error ? error.message : String(error);
  for (const [name, factory] of Object.entries(ACL_ERROR_MAP)) {
    if (message.includes(name)) {
      return factory(cause);
    }
  }

  return null;
}
