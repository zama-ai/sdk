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
  readWorkerClassification,
} from "../utils/error";

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

  // Causes classified at the worker source and threaded across the boundary
  // (structured clone otherwise leaves only the message). Discriminated on
  // `errorCode`, so each branch gets exactly its own typed payload.
  const classification = readWorkerClassification(error);
  if (classification?.errorCode === ZamaErrorCode.NotEntitled) {
    return new NotEntitledError(
      {
        handle: classification.handle,
        contractAddress: classification.contractAddress,
        account: classification.account,
      },
      { cause: error },
    );
  }
  if (classification?.errorCode === ZamaErrorCode.RpcRateLimited) {
    return new RpcRateLimitError(error instanceof Error ? error.message : fallbackMessage, {
      cause: error,
      retryAfter: classification.retryAfter ?? extractRetryAfterMs(error),
    });
  }

  // Raw main-thread provider error (e.g. the cleartext relayer's ACL reads):
  // promote an unambiguous structured rate-limit signal (-32005 / `status: 429`)
  // regardless of any HTTP status. Worker-origin relayer 429s carry a top-level
  // `statusCode` (not `status`) and fall through to RelayerRequestFailedError.
  if (hasStructuredRpcRateLimitSignal(error)) {
    return new RpcRateLimitError(error instanceof Error ? error.message : fallbackMessage, {
      cause: error,
      retryAfter: extractRetryAfterMs(error),
    });
  }

  const statusCode = classification?.statusCode ?? extractHttpStatus(error);

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
