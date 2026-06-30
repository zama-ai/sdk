import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The consumer's RPC provider rate-limited an on-chain read the SDK performs
 * during decryption (e.g. the ACL check) — HTTP 429 or JSON-RPC `-32005`. An
 * RPC-endpoint problem, **not** a decryption/entitlement failure, and safe to
 * **retry**. Kept distinct from the relayer's own back-pressure
 * ({@link RelayerRequestFailedError}).
 *
 * Backoff for chain RPC is owned by the consumer's transport: viem/ethers
 * already honor the `Retry-After` header and retry internally before this error
 * surfaces, so it is configured on the transport you pass via `chain.network`
 * (not re-implemented here).
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
   * Suggested delay before retrying, in **seconds**, when a numeric `retryAfter`
   * is present on the error. Usually `undefined` for chain RPC: the `Retry-After`
   * header is consumed by the consumer's viem/ethers transport (which owns the
   * backoff), not surfaced here — see the class doc.
   */
  readonly retryAfter: number | undefined;

  constructor(message: string, options?: ErrorOptions & { retryAfter?: number }) {
    const { retryAfter, ...errorOptions } = options ?? {};
    super(ZamaErrorCode.RpcRateLimited, message, errorOptions);
    this.name = "RpcRateLimitError";
    this.retryAfter = retryAfter;
  }
}
