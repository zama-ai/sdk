import { ZamaErrorCode, type ZamaError } from "./base";
import { DecryptionFailedError } from "./encryption";
import { NoCiphertextError } from "./credential";
import { RelayerRequestFailedError } from "./relayer";
import { DelegationNotPropagatedError } from "./delegation";
import { NotEntitledError } from "./entitlement";
import { RpcRateLimitError } from "./rpc";
import { SigningRejectedError, SigningFailedError } from "./signing";
import {
  extractHttpStatus,
  extractRetryAfterMs,
  hasStructuredRpcRateLimitSignal,
  isRpcRateLimitError,
} from "../utils/error";

/** Read the `zamaErrorCode` the worker client attaches to cross-thread errors. */
function readZamaErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "zamaErrorCode" in error) {
    const code = (error as { zamaErrorCode?: unknown }).zamaErrorCode;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Read a numeric `retryAfter` the worker client attaches to cross-thread errors. */
function readRetryAfter(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "retryAfter" in error) {
    const v = (error as { retryAfter?: unknown }).retryAfter;
    return typeof v === "number" ? v : undefined;
  }
  return undefined;
}

/** Read a string field the worker client attaches to cross-thread errors. */
function readStringField(error: unknown, key: string): string {
  if (typeof error === "object" && error !== null && key in error) {
    const v = (error as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}

/**
 * Inspect a caught error for an HTTP status code and return the appropriate
 * typed SDK error (NoCiphertextError for 400, RelayerRequestFailedError for
 * other HTTP errors, or the generic DecryptionFailedError as fallback).
 *
 * Errors that are already typed SDK errors (e.g. {@link SigningRejectedError},
 * {@link DecryptionFailedError}) are returned as-is so callers can still match
 * the original cause.
 *
 * When `isDelegated` is true and the relayer returns a 500, the error is
 * wrapped as {@link DelegationNotPropagatedError} because the most likely
 * cause is that the gateway hasn't synced the delegation from L1 yet.
 */
export function wrapDecryptError(
  error: unknown,
  fallbackMessage: string,
  isDelegated = false,
): ZamaError {
  if (
    error instanceof DecryptionFailedError ||
    error instanceof NoCiphertextError ||
    error instanceof RelayerRequestFailedError ||
    error instanceof DelegationNotPropagatedError ||
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError ||
    error instanceof NotEntitledError ||
    error instanceof RpcRateLimitError
  ) {
    return error;
  }

  // Not-entitled, classified at the worker source from the relayer's own ACL
  // check (`zamaErrorCode`) — no extra on-chain reads. Terminal/non-retryable.
  if (readZamaErrorCode(error) === ZamaErrorCode.NotEntitled) {
    return new NotEntitledError(
      {
        handle: readStringField(error, "handle"),
        contractAddress: readStringField(error, "contractAddress"),
        account: readStringField(error, "account"),
      },
      { cause: error },
    );
  }

  // Provider RPC rate-limit, in priority order:
  // 1. classified at the worker source (`zamaErrorCode`) — authoritative;
  // 2. an unambiguous structured signal (-32005 / `status: 429`) on a raw
  //    main-thread error, promoted regardless of any HTTP status it carries.
  // Worker-origin relayer 429s carry a top-level `statusCode` (not `status`) and
  // are intentionally excluded here, staying RelayerRequestFailedError below.
  if (
    readZamaErrorCode(error) === ZamaErrorCode.RpcRateLimited ||
    hasStructuredRpcRateLimitSignal(error)
  ) {
    return new RpcRateLimitError(error instanceof Error ? error.message : fallbackMessage, {
      cause: error,
      retryAfter: readRetryAfter(error) ?? extractRetryAfterMs(error),
    });
  }

  const statusCode = extractHttpStatus(error);

  // Message-only RPC throttle (no structured signal, no HTTP status) on a raw
  // main-thread error, e.g. the cleartext relayer's ACL reads.
  if (statusCode === undefined && isRpcRateLimitError(error)) {
    return new RpcRateLimitError(error instanceof Error ? error.message : fallbackMessage, {
      cause: error,
      retryAfter: extractRetryAfterMs(error),
    });
  }

  if (statusCode === 400) {
    return new NoCiphertextError(
      error instanceof Error ? error.message : "No ciphertext for this account",
      { cause: error },
    );
  }

  if (isDelegated && statusCode === 500) {
    return new DelegationNotPropagatedError(
      "Delegated decryption failed with a server error. " +
        "This is most commonly caused by the delegation not having propagated to the gateway yet — " +
        "after granting delegation, allow 1–2 minutes for cross-chain synchronization before retrying. " +
        "If the error persists, the gateway or relayer may be experiencing an unrelated issue.",
      { cause: error },
    );
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      { cause: error },
    );
  }

  return new DecryptionFailedError(fallbackMessage, {
    cause: error,
  });
}
