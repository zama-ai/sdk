import { KeyWrappingError } from "./credential";
import { ConfigurationError } from "./relayer";
import { RpcRateLimitError } from "./rpc";
import { SigningRejectedError, SigningFailedError } from "./signing";

/**
 * Returns `true` for errors that should abort an entire batch operation
 * rather than be recorded per-item — wallet signature rejected, signing
 * infrastructure broken, SDK misconfigured, the RPC provider throttling, or
 * transport key pair wrapping unusable for the whole session (wrong or missing
 * `transportKeyPairDerivationSecret`, `crypto.subtle` unavailable).
 * These are systemic failures that won't recover within the same call; for a
 * rate-limit in particular, the per-item retry loop would only amplify the
 * throttle by re-hitting the already-rate-limited endpoint.
 *
 * Callers iterating over a batch (e.g. per-token decrypt) should rethrow when
 * this predicate is true so the whole batch aborts, and record the error
 * per-item otherwise.
 */
export function isFatalBatchError(error: unknown): boolean {
  return (
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError ||
    error instanceof ConfigurationError ||
    error instanceof RpcRateLimitError ||
    error instanceof KeyWrappingError
  );
}
