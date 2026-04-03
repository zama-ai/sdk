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
  /** Confidential (cToken) balance is insufficient for the requested operation. */
  InsufficientConfidentialBalance: "INSUFFICIENT_CONFIDENTIAL_BALANCE",
  /** ERC-20 balance is insufficient for the requested shield amount. */
  InsufficientERC20Balance: "INSUFFICIENT_ERC20_BALANCE",
  /** Balance validation could not be performed (no cached credentials and decryption not possible). */
  BalanceCheckUnavailable: "BALANCE_CHECK_UNAVAILABLE",
  /** Public ERC-20 read (e.g. balanceOf) failed due to a network or contract error. */
  ERC20ReadFailed: "ERC20_READ_FAILED",
  /** The new expiration date equals the current one — no on-chain change needed. */
  DelegationExpiryUnchanged: "DELEGATION_EXPIRY_UNCHANGED",
  /** Delegate address cannot be the contract address. */
  DelegationDelegateEqualsContract: "DELEGATION_DELEGATE_EQUALS_CONTRACT",
  /** Contract address cannot be the sender address. */
  DelegationContractIsSelf: "DELEGATION_CONTRACT_IS_SELF",
  /** The ACL contract is paused. */
  AclPaused: "ACL_PAUSED",
  /** Expiration date is too soon (must be at least 1 hour in the future). */
  DelegationExpirationTooSoon: "DELEGATION_EXPIRATION_TOO_SOON",
  /** Delegation exists on-chain but hasn't propagated to the gateway yet. */
  DelegationNotPropagated: "DELEGATION_NOT_PROPAGATED",
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
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ZamaError";
    this.code = code;
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
    if (handler) {
      return handler(error);
    }
  }
  return handlers._?.(error);
}
