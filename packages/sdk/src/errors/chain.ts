import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Thrown when the signer and provider are connected to different chains at the
 * start of a write operation.
 *
 * Every write method calls {@link ZamaSDK.requireChainAlignment} as a pre-flight
 * check. If `signer.getChainId()` and `provider.getChainId()` return different
 * values, this error is thrown before any RPC mutation is attempted.
 *
 * @example
 * ```ts
 * try {
 *   await token.shield(1000n);
 * } catch (e) {
 *   if (e instanceof ChainMismatchError) {
 *     console.error(
 *       `Signer is on chain ${e.signerChainId} but provider is on chain ${e.providerChainId}`,
 *     );
 *   }
 * }
 * ```
 */
export class ChainMismatchError extends ZamaError {
  readonly operation: string;
  readonly signerChainId: number;
  readonly providerChainId: number;

  constructor(
    {
      operation,
      signerChainId,
      providerChainId,
    }: { operation: string; signerChainId: number; providerChainId: number },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.ChainMismatch,
      `Operation "${operation}" requires signer and provider to be on the same chain, ` +
        `but signer is on chain ${signerChainId} and provider is on chain ${providerChainId}.`,
      options,
    );
    this.name = "ChainMismatchError";
    this.operation = operation;
    this.signerChainId = signerChainId;
    this.providerChainId = providerChainId;
  }
}
