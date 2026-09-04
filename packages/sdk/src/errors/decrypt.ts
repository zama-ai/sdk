import type { ZamaError } from "./base";
import { DecryptionFailedError } from "./encryption";
import {
  InvalidTransportKeyPairError,
  NoCiphertextError,
  RevokedKmsContextError,
  UnifiedDecryptionUnsupportedError,
} from "./credential";
import { RelayerRequestFailedError } from "./relayer";
import { DelegationNotPropagatedError } from "./delegation";
import { NotEntitledError } from "./entitlement";
import { RpcRateLimitError } from "./rpc";
import { SigningRejectedError, SigningFailedError } from "./signing";
import {
  extractHttpStatus,
  extractRetryAfter,
  hasStructuredRpcRateLimitSignal,
  isInvalidTransportKeyPairMessage,
  isNotEntitledMessage,
  isRelayerError,
  isRelayerTimeoutError,
  isRevokedKmsContextError,
  isRpcRateLimitError,
  isUnifiedDecryptionUnsupportedMessage,
  parseHandleFromMessage,
} from "../utils/error";

/**
 * Context the caller supplies so a not-entitled / delegation failure can be
 * mapped precisely. The request context (`contractAddress` / `account`) is not
 * present on the raw error, so it is injected here.
 */
export interface DecryptErrorContext {
  isDelegated?: boolean;
  contractAddress?: string;
  /** The ACL actor (signer, or delegator for delegated decrypt). */
  account?: string;
}

/**
 * Every typed SDK error `wrapDecryptError` may see on its way in (from a prior
 * classification, a worker rethrow, or a caller-level retry) and must pass
 * through unchanged rather than collapse into terminal `DecryptionFailedError`.
 * A single source of truth for the early-return check below and for the
 * `errors.test.ts` "every typed cause passes through unchanged" test — so a
 * class dropped from this array is caught by that test instead of silently
 * falling through to the generic fallback.
 *
 * This is a fixed, decrypt-scoped subset of the taxonomy maintained by hand
 * (unlike {@link RETRYABLE_BY_CODE} in `base.ts`, it has no `Complete<>` tie
 * to `ZamaErrorCode`) — a new decrypt-path error class must be added here
 * explicitly, since there's no compiler check forcing it.
 */
export const DECRYPT_PASSTHROUGH_ERROR_TYPES = [
  DecryptionFailedError,
  NoCiphertextError,
  RelayerRequestFailedError,
  DelegationNotPropagatedError,
  SigningRejectedError,
  SigningFailedError,
  NotEntitledError,
  RpcRateLimitError,
  InvalidTransportKeyPairError,
  RevokedKmsContextError,
  UnifiedDecryptionUnsupportedError,
] as const;

/**
 * The single decryption-error classifier. Maps a caught error to the right typed
 * SDK error: not-entitled (ACL), consumer RPC rate-limit, NoCiphertext (400),
 * DelegationNotPropagated (delegated 500 *or* a delegated ACL denial, which is
 * transient), RelayerRequestFailed (other HTTP), or the generic DecryptionFailed
 * fallback.
 *
 * Errors that are already typed SDK errors are returned as-is so callers can
 * still match the original cause. All structured signals (codes, status, cause
 * chain) are read from the error itself.
 */
export function wrapDecryptError(
  error: unknown,
  fallbackMessage: string,
  ctx: DecryptErrorContext = {},
): ZamaError {
  if (DECRYPT_PASSTHROUGH_ERROR_TYPES.some((ErrorType) => error instanceof ErrorType)) {
    return error as ZamaError;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  // Stale transport key pair the relayer can't re-derive (post KMS/TKMS rotation).
  // Typed so the decrypt path can evict the vault entry and regenerate on retry.
  if (error instanceof Error && isInvalidTransportKeyPairMessage(error.message)) {
    return new InvalidTransportKeyPairError(error.message, { cause: error });
  }

  // The permit's KMS context was revoked on-chain (InvalidKmsContext revert).
  // Typed so the decrypt path can evict the dead permit, re-grant, and retry once.
  if (isRevokedKmsContextError(error)) {
    return new RevokedKmsContextError(
      "The permit's KMS context has been revoked on-chain, so the permit is no longer usable. " +
        "The SDK evicts the permit and re-grants automatically; if this error surfaced, the retry " +
        "failed the same way. The on-chain validity check is cached for up to 15 minutes, so a " +
        "just-revoked context can keep failing across that window. Retry after the window; the " +
        "SDK re-runs the recovery on the next decrypt, no manual cleanup is needed.",
      { cause: error },
    );
  }

  // A stored V2/wildcard permit's scope is needed for this decrypt, but this
  // relayer instance hasn't deployed /v3/user-decrypt yet — distinct from
  // UnifiedPermitNotSupportedError (signing-time, chain hasn't upgraded).
  if (error instanceof Error && isUnifiedDecryptionUnsupportedMessage(error.message)) {
    return new UnifiedDecryptionUnsupportedError(
      "This account's stored permit for this scope is a wildcard (V2) permit, but the connected " +
        "relayer does not yet support unified decryption (/v3/user-decrypt). Grant a specific-" +
        "contract permit instead (sdk.permits.grantPermit([...])), or retry once the relayer upgrades.",
      { cause: error },
    );
  }

  // Actor not entitled (ACL). The relayer throws a message-only Error; the handle
  // is parseable from it and the contract/account come from the request context
  // the caller holds.
  if (error instanceof Error && isNotEntitledMessage(error.message)) {
    // On the delegated path the "not entitled" verdict comes from the
    // *delegator's* `persistAllowed` L1 read, which has no staleness tolerance:
    // it returns false *transiently* when the delegation has just landed or the
    // consumer's RPC serves a lagging block. Terminal `NotEntitledError` ("never
    // retry") would be the wrong signal for that propagation window, so — mirroring
    // the delegated-500 branch below — surface the retryable
    // `DelegationNotPropagatedError` instead. A direct signer denial (non-
    // delegated) stays terminal `NotEntitledError`.
    if (ctx.isDelegated) {
      return new DelegationNotPropagatedError(
        "Delegated decryption was denied by the on-chain ACL check. " +
          "This is most commonly caused by the delegation not having propagated yet, or by the " +
          "RPC node serving a stale block. Propagation usually completes within ~10 blocks (a few " +
          "seconds) and the SDK retries across that window; seeing this means it did not sync in time. " +
          "Retry shortly (and prefer a fresh, low-lag RPC endpoint). If it persists, the delegator may " +
          "genuinely lack the on-chain ACL grant.",
        { cause: error },
      );
    }
    return new NotEntitledError(
      {
        encryptedValue: parseHandleFromMessage(error.message) ?? "",
        contractAddress: ctx.contractAddress ?? "",
        account: ctx.account ?? "",
      },
      { cause: error },
    );
  }

  // Consumer's RPC provider throttling an on-chain read. An unambiguous
  // structured signal (-32005 / viem `status: 429`) wins over any HTTP status;
  // relayer-origin errors are `@fhevm/sdk` `Relayer*` classes and are excluded by
  // `isRelayerError`, staying RelayerRequestFailedError below.
  if (hasStructuredRpcRateLimitSignal(error)) {
    return new RpcRateLimitError(message, { cause: error, retryAfter: extractRetryAfter(error) });
  }

  const statusCode = extractHttpStatus(error);

  // A message-only throttle ("Too Many Requests" / "rate limit") is trusted only
  // when no HTTP status is present — otherwise the status classification (e.g. a
  // relayer error whose body mentions a rate limit) takes precedence.
  if (statusCode === undefined && isRpcRateLimitError(error)) {
    return new RpcRateLimitError(message, { cause: error, retryAfter: extractRetryAfter(error) });
  }

  if (statusCode === 400) {
    return new NoCiphertextError(
      error instanceof Error ? error.message : "No ciphertext for this account",
      { cause: error },
    );
  }

  if (ctx.isDelegated && statusCode === 500) {
    return new DelegationNotPropagatedError(
      "Delegated decryption failed with a server error. " +
        "This is most commonly caused by the delegation not having propagated to the gateway yet. " +
        "Cross-chain sync usually completes within ~10 blocks (a few seconds) and the SDK retries " +
        "across that window; seeing this means it did not sync in time — retry shortly. " +
        "If the error persists, the gateway or relayer may be experiencing an unrelated issue.",
      { cause: error },
    );
  }

  if (isRelayerError(error) || statusCode !== undefined) {
    return new RelayerRequestFailedError(message, statusCode, {
      cause: error,
      retryAfter: extractRetryAfter(error),
      // A relayer timeout carries no HTTP status but is safe to retry; force
      // `retryable` so it isn't misclassified as terminal. Other relayer errors
      // fall back to the status-based default (429 → retryable).
      retryable: isRelayerTimeoutError(error) || undefined,
    });
  }

  return new DecryptionFailedError(fallbackMessage, { cause: error });
}
