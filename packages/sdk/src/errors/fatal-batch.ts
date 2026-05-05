import { ConfigurationError } from "./relayer";
import { SigningRejectedError, SigningFailedError } from "./signing";

/**
 * Returns `true` for errors that should abort an entire batch operation
 * rather than be recorded per-item — wallet signature rejected, signing
 * infrastructure broken, or SDK misconfigured. These are systemic failures
 * that won't recover within the same call.
 *
 * Callers iterating over a batch (e.g. per-token decrypt) should rethrow when
 * this predicate is true so the whole batch aborts, and record the error
 * per-item otherwise.
 */
export function isFatalBatchError(error: unknown): boolean {
  return (
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError ||
    error instanceof ConfigurationError
  );
}
