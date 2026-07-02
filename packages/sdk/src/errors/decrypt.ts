import type { ZamaError } from "./base";
import { DecryptionFailedError } from "./encryption";
import { NoCiphertextError } from "./credential";
import { RelayerRequestFailedError } from "./relayer";
import { DelegationNotPropagatedError } from "./delegation";
import { NotEntitledError } from "./entitlement";
import { RpcRateLimitError } from "./rpc";
import { SigningRejectedError, SigningFailedError } from "./signing";
import { WorkerRecycledError, WorkerTimeoutError } from "./timeout";
import {
  extractHttpStatus,
  extractRetryAfter,
  hasStructuredRpcRateLimitSignal,
  isNotEntitledMessage,
  isRpcRateLimitError,
  parseHandleFromMessage,
} from "../utils/error";

/**
 * Context the caller supplies so a not-entitled / delegation failure can be
 * mapped precisely. The classifier runs on both worker-origin errors (rebuilt
 * from the serialized envelope) and main-thread-origin ones (cleartext relayer,
 * delegation pre-check) — the request context (`contractAddress` / `account`)
 * only exists on the main thread, so it is injected here rather than threaded
 * across the worker boundary.
 */
export interface DecryptErrorContext {
  isDelegated?: boolean;
  contractAddress?: string;
  /** The ACL actor (signer, or delegator for delegated decrypt). */
  account?: string;
}

/**
 * The single decryption-error classifier. Maps a caught error to the right typed
 * SDK error: not-entitled (ACL), consumer RPC rate-limit, NoCiphertext (400),
 * DelegationNotPropagated (delegated 500 *or* a delegated ACL denial, which is
 * transient), RelayerRequestFailed (other HTTP), or the generic DecryptionFailed
 * fallback.
 *
 * Errors that are already typed SDK errors are returned as-is so callers can
 * still match the original cause. All structured signals (codes, status, cause
 * chain) are read from the error itself — worker-origin errors are first rebuilt
 * by {@link deserializeError}, so this runs identically regardless of origin.
 */
export function wrapDecryptError(
  error: unknown,
  fallbackMessage: string,
  ctx: DecryptErrorContext = {},
): ZamaError {
  if (
    error instanceof DecryptionFailedError ||
    error instanceof NoCiphertextError ||
    error instanceof RelayerRequestFailedError ||
    error instanceof DelegationNotPropagatedError ||
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError ||
    error instanceof NotEntitledError ||
    error instanceof RpcRateLimitError ||
    error instanceof WorkerTimeoutError ||
    error instanceof WorkerRecycledError
  ) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  // Actor not entitled (ACL). The relayer throws a message-only Error whose text
  // survives the worker boundary; the handle is parseable from it and the
  // contract/account come from the request context the caller holds.
  if (error instanceof Error && isNotEntitledMessage(error.message)) {
    // On the delegated path the "not entitled" verdict comes from the
    // *delegator's* `persistAllowed` L1 read, which has no staleness tolerance:
    // it returns false *transiently* when the delegation has just landed or the
    // consumer's RPC serves a lagging block. Terminal `NotEntitledError` ("never
    // retry") would be the wrong signal for that 1–2 min window, so — mirroring
    // the delegated-500 branch below — surface the retryable
    // `DelegationNotPropagatedError` instead. A direct signer denial (non-
    // delegated) stays terminal `NotEntitledError`.
    if (ctx.isDelegated) {
      return new DelegationNotPropagatedError(
        "Delegated decryption was denied by the on-chain ACL check. " +
          "This is most commonly caused by the delegation not having propagated yet, or by the " +
          "RPC node serving a stale block — after granting delegation, allow 1–2 minutes (and prefer " +
          "a fresh, low-lag RPC endpoint) before retrying. If it persists, the delegator may genuinely " +
          "lack the on-chain ACL grant.",
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
  // relayer-origin 429s carry `code: "RELAYER_FETCH_ERROR"` and are excluded,
  // staying RelayerRequestFailedError below.
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
        "This is most commonly caused by the delegation not having propagated to the gateway yet — " +
        "after granting delegation, allow 1–2 minutes for cross-chain synchronization before retrying. " +
        "If the error persists, the gateway or relayer may be experiencing an unrelated issue.",
      { cause: error },
    );
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(message, statusCode, {
      cause: error,
      retryAfter: extractRetryAfter(error),
    });
  }

  return new DecryptionFailedError(fallbackMessage, { cause: error });
}
