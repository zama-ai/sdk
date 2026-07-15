import { isValidRetryAfterSeconds } from "../utils/error";

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
  /** The configured signer/account is not entitled (ACL) to decrypt this encrypted value. Don't retry — wait for a grant. */
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
  /** The on-chain read needed to verify a key/CRS digest failed (RPC error, timeout). Retryable. */
  KeyDigestVerificationFailed: "KEY_DIGEST_VERIFICATION_FAILED",
  /** Downloaded FHE public key or CRS bytes don't match the on-chain KMSGeneration digest. */
  KeyDigestMismatch: "KEY_DIGEST_MISMATCH",
} as const;

/** Union of all {@link ZamaErrorCode} string values. */
export type ZamaErrorCode = (typeof ZamaErrorCode)[keyof typeof ZamaErrorCode];

/** Identity type that fails to instantiate unless `T` maps every {@link ZamaErrorCode} to a `boolean`. */
type Complete<T extends Record<ZamaErrorCode, boolean>> = T;

/**
 * Default retryability for each {@link ZamaErrorCode}. `Complete` fails the build
 * if a new code is added without an entry here — the same exhaustiveness guard
 * `matchZamaError`'s `ErrorForCode` map uses (see `match.ts`) — so a new
 * transient (or terminal) cause can't silently default to the wrong signal.
 *
 * {@link RelayerRequestFailedError} is the one exception: its retryability
 * depends on the HTTP status (only a 429 is retryable), not just the code, so
 * it overrides this default via the constructor's `retryable` option instead
 * of being read from here.
 */
const RETRYABLE_BY_CODE: Complete<Record<ZamaErrorCode, boolean>> = {
  [ZamaErrorCode.SigningRejected]: false,
  [ZamaErrorCode.SigningFailed]: false,
  [ZamaErrorCode.EncryptionFailed]: false,
  [ZamaErrorCode.DecryptionFailed]: false,
  [ZamaErrorCode.TransactionReverted]: false,
  [ZamaErrorCode.TransportKeyPairExpired]: false,
  [ZamaErrorCode.InvalidTransportKeyPair]: false,
  [ZamaErrorCode.NoCiphertext]: false,
  [ZamaErrorCode.RelayerRequestFailed]: false, // conditional — see doc above
  [ZamaErrorCode.NotEntitled]: false,
  [ZamaErrorCode.RpcRateLimited]: true,
  [ZamaErrorCode.Configuration]: false,
  [ZamaErrorCode.DelegationSelfNotAllowed]: false,
  [ZamaErrorCode.DelegationCooldown]: true, // per-block timing gate, resolves on next-block retry
  [ZamaErrorCode.DelegationNotFound]: false,
  [ZamaErrorCode.DelegationExpired]: false,
  [ZamaErrorCode.InsufficientConfidentialBalance]: false,
  [ZamaErrorCode.InsufficientERC20Balance]: false,
  [ZamaErrorCode.BalanceCheckUnavailable]: false,
  [ZamaErrorCode.ERC20ReadFailed]: false, // conservative: conflates network (transient) and contract (terminal) faults, see class doc
  [ZamaErrorCode.DelegationExpiryUnchanged]: false,
  [ZamaErrorCode.DelegationDelegateEqualsContract]: false,
  [ZamaErrorCode.DelegationContractIsSelf]: false,
  [ZamaErrorCode.AclPaused]: false,
  [ZamaErrorCode.DelegationExpirationTooSoon]: false,
  [ZamaErrorCode.DelegationNotPropagated]: true,
  [ZamaErrorCode.ChainMismatch]: false,
  [ZamaErrorCode.SignerNotConfigured]: false,
  [ZamaErrorCode.WalletNotConnected]: false,
  [ZamaErrorCode.WalletAccountNotReady]: true, // async wallet-account discovery still resolving
};

/**
 * Base error thrown by all SDK operations.
 * Carries a {@link ZamaErrorCode} for programmatic error handling.
 * Prefer catching specific subclasses (e.g. {@link EncryptionFailedError}).
 */
export class ZamaError extends Error {
  /** Machine-readable error code. */
  readonly code: ZamaErrorCode;

  /**
   * Whether the operation that threw this error is safe to retry. Defaults to
   * {@link RETRYABLE_BY_CODE}'s entry for `code`; only {@link RelayerRequestFailedError}
   * overrides it per-instance (its retryability depends on the HTTP status).
   * Prefer {@link isRetryable} over reading this directly, so a new `unknown`
   * caught value doesn't need an `instanceof ZamaError` check first.
   */
  readonly retryable: boolean;

  constructor(
    code: ZamaErrorCode,
    message: string,
    options?: ErrorOptions & { retryable?: boolean },
  ) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ZamaError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE_BY_CODE[code];
  }
}

/**
 * True if `error` is a {@link ZamaError} whose failure is transient and safe to
 * retry (rate-limited, back-pressured, a delegation still propagating or in
 * its per-block cooldown, or a wallet account still resolving).
 * Compiler-guaranteed to stay in sync with the
 * taxonomy: every {@link ZamaError} subclass declares its own retryability via
 * {@link ZamaError.retryable}, so a consumer never has to hardcode a set of
 * retryable codes.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
 * } catch (e) {
 *   if (isRetryable(e)) {
 *     // back off and retry (see retryAfterSeconds for a server-suggested delay)
 *   } else {
 *     throw e; // terminal — surface it
 *   }
 * }
 * ```
 */
export function isRetryable(error: unknown): error is ZamaError & { retryable: true } {
  return error instanceof ZamaError && error.retryable;
}

/**
 * The server-suggested retry delay, in **seconds**, for a retryable
 * {@link ZamaError} — unifying the `retryAfter` field that today lives on
 * {@link RelayerRequestFailedError} and {@link RpcRateLimitError} only.
 * `undefined` when the error isn't retryable, or is retryable but carries no
 * server-driven delay (e.g. {@link DelegationNotPropagatedError} — retry that
 * with your own backoff).
 */
export function retryAfterSeconds(error: unknown): number | undefined {
  if (!isRetryable(error) || !("retryAfter" in error)) {
    return undefined;
  }
  const retryAfter = (error as ZamaError & { retryAfter?: unknown }).retryAfter;
  return isValidRetryAfterSeconds(retryAfter) ? retryAfter : undefined;
}
