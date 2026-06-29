import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The consumer's RPC provider rate-limited an on-chain read the SDK performs
 * during decryption (e.g. the ACL check) — HTTP 429 or JSON-RPC `-32005`. An
 * RPC-endpoint problem, **not** a decryption/entitlement failure, and safe to
 * **retry** with backoff. Kept distinct from the relayer's own back-pressure
 * ({@link RelayerRequestFailedError}).
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
   * Suggested delay before retrying, in milliseconds, when the provider supplied
   * one — parsed from a numeric `retryAfter`/`retryAfterMs` or the `Retry-After`
   * header (e.g. viem's `HttpRequestError`). `undefined` when unknown. Named to
   * match {@link RelayerRequestFailedError.retryAfterMs}.
   */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options?: ErrorOptions & { retryAfterMs?: number }) {
    const { retryAfterMs, ...errorOptions } = options ?? {};
    super(ZamaErrorCode.RpcRateLimited, message, errorOptions);
    this.name = "RpcRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
