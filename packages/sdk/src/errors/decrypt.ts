import type { ZamaError } from "./base";
import { DecryptionFailedError } from "./encryption";
import { NoCiphertextError } from "./credential";
import { RelayerRequestFailedError } from "./relayer";
import { DelegationNotPropagatedError } from "./delegation";
import { SigningRejectedError, SigningFailedError } from "./signing";

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
    error instanceof SigningFailedError
  ) {
    return error;
  }

  const statusCode =
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : undefined;

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
