import { ConfigurationError } from "./relayer";
import { SigningRejectedError, SigningFailedError } from "./signing";

/**
 * Returns `true` for errors that indicate a session-level failure — i.e.
 * problems that affect the whole SDK session (wallet signature rejected,
 * signing infra broken, SDK misconfigured) rather than a single item in a
 * batch operation.
 *
 * Callers iterating over a batch (e.g. per-token decrypt) should rethrow when
 * this predicate is true so the whole batch aborts, and record the error
 * per-item otherwise.
 */
export function isSessionError(error: unknown): boolean {
  return (
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError ||
    error instanceof ConfigurationError
  );
}
