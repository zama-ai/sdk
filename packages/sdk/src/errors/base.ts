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
  /** On-chain transaction reverted. */
  TransactionReverted: "TRANSACTION_REVERTED",
  /** Transport key pair has expired and needs regeneration. */
  TransportKeyPairExpired: "KEYPAIR_EXPIRED",
  /** Relayer rejected transport key pair (stale, expired, or malformed). */
  InvalidTransportKeyPair: "INVALID_KEYPAIR",
  /** No FHE ciphertext exists for this account (never shielded). */
  NoCiphertext: "NO_CIPHERTEXT",
  /** Relayer HTTP request failed. */
  RelayerRequestFailed: "RELAYER_REQUEST_FAILED",
  /** The configured signer/account is not entitled (ACL) to decrypt this handle. Don't retry — wait for a grant. */
  NotEntitled: "NOT_ENTITLED",
  /** The consumer's RPC provider rate-limited an on-chain read (e.g. HTTP 429 / JSON-RPC -32005). Retryable. */
  RpcRateLimited: "RPC_RATE_LIMITED",
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
  /** Signer and provider are connected to different chains. */
  ChainMismatch: "CHAIN_MISMATCH",
  /** Operation requires a signer but none is configured. */
  SignerNotConfigured: "SIGNER_NOT_CONFIGURED",
  /** Operation requires a connected wallet account. */
  WalletNotConnected: "WALLET_NOT_CONNECTED",
  /** Wallet account discovery is still resolving. */
  WalletAccountNotReady: "WALLET_ACCOUNT_NOT_READY",
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
