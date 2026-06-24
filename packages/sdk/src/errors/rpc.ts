import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The consumer's RPC provider rate-limited an on-chain read the SDK performs
 * during decryption (e.g. the ACL `persistAllowed` check).
 *
 * Surfaced when a provider returns HTTP 429 ("Too Many Requests") or the
 * JSON-RPC `-32005` ("limit exceeded") code. This is an **infrastructure**
 * problem with the consumer's RPC endpoint, **not** a decryption or
 * entitlement failure: the correct fix is a higher rate limit / different RPC
 * endpoint, and the operation is safe to **retry** (ideally with backoff).
 *
 * Without this distinct error the failure collapses into
 * {@link DecryptionFailedError}, which misleads integrators into re-checking
 * rights or re-delegating when the real cause is the RPC provider.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
 * } catch (e) {
 *   if (e instanceof RpcRateLimitError) {
 *     // back off and retry; consider a higher-throughput RPC endpoint
 *   }
 * }
 * ```
 */
export class RpcRateLimitError extends ZamaError {
  /**
   * Suggested delay before retrying, in milliseconds, when the provider
   * supplied one (e.g. a `Retry-After` header). `undefined` when unknown.
   */
  readonly retryAfter: number | undefined;

  constructor(message: string, options?: ErrorOptions & { retryAfter?: number }) {
    const { retryAfter, ...errorOptions } = options ?? {};
    super(ZamaErrorCode.RpcRateLimited, message, errorOptions);
    this.name = "RpcRateLimitError";
    this.retryAfter = retryAfter;
  }
}
