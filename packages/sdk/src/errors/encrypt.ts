import { extractHttpStatus, extractRetryAfter } from "../utils/error";
import { ZamaError } from "./base";
import { EncryptionFailedError } from "./encryption";
import { RelayerRequestFailedError } from "./relayer";

/**
 * Inspect a caught encryption error for an HTTP status code and return the
 * appropriate typed SDK error. When the relayer (or an intermediary such as
 * Cloudflare/Kong) carried an HTTP status — e.g. a 401/403 for a missing or
 * invalid `x-api-key` — surface it as a {@link RelayerRequestFailedError} so the
 * status code and the relayer's own message reach the caller, instead of
 * collapsing every failure into a generic {@link EncryptionFailedError}.
 *
 * Errors that are already typed SDK errors are returned as-is so callers can
 * still match the original cause.
 *
 * The worker boundary normalizes the relayer SDK's `cause.status` onto a
 * top-level `statusCode`, so reading `statusCode` here mirrors
 * {@link wrapDecryptError}.
 */
export function wrapEncryptError(error: unknown, fallbackMessage: string): ZamaError {
  if (error instanceof ZamaError) {
    return error;
  }

  const statusCode = extractHttpStatus(error);

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      {
        cause: error,
        retryAfter: extractRetryAfter(error),
      },
    );
  }

  return new EncryptionFailedError(fallbackMessage, { cause: error });
}
