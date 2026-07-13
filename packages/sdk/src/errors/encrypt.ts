import {
  extractHttpStatus,
  extractRetryAfter,
  isRelayerError,
  isRelayerTimeoutError,
} from "../utils/error";
import { ZamaError } from "./base";
import { EncryptionFailedError } from "./encryption";
import { RelayerRequestFailedError } from "./relayer";

/**
 * Inspect a caught encryption error for an `@fhevm/sdk` relayer origin or HTTP
 * status code and return the appropriate typed SDK error. Relayer transport
 * failures without a status, plus HTTP failures from the relayer or an
 * intermediary such as Cloudflare/Kong, surface as
 * {@link RelayerRequestFailedError} instead of collapsing into a generic
 * {@link EncryptionFailedError}.
 *
 * Errors that are already typed SDK errors are returned as-is so callers can
 * still match the original cause.
 *
 * The relayer's HTTP status may surface as `status` or `statusCode` anywhere in
 * the cause chain; {@link extractHttpStatus} walks the chain for either, mirroring
 * {@link wrapDecryptError}.
 */
export function wrapEncryptError(error: unknown, fallbackMessage: string): ZamaError {
  if (error instanceof ZamaError) {
    return error;
  }

  const statusCode = extractHttpStatus(error);
  // A relayer timeout carries no HTTP status but is safe to retry — surface it as
  // a retryable RelayerRequestFailedError rather than a terminal EncryptionFailed.
  const isTimeout = isRelayerTimeoutError(error);

  if (statusCode !== undefined || isRelayerError(error)) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      { cause: error, retryAfter: extractRetryAfter(error), retryable: isTimeout || undefined },
    );
  }

  return new EncryptionFailedError(fallbackMessage, { cause: error });
}
