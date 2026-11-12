import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Thrown when the signer and provider are connected to different chains at the
 * start of a write operation.
 *
 * Every write method runs a chain-alignment pre-flight check. If
 * `signer.getChainId()` and `provider.getChainId()` return different values,
 * this error is thrown before any RPC mutation is attempted.
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
  /** Name of the operation that triggered the check. */
  readonly operation: string;
  /** Chain ID the signer is connected to. */
  readonly signerChainId: number;
  /** Chain ID the provider is connected to. */
  readonly providerChainId: number;
  /** Chain ID the operation's contract is pinned to, when it differs from the provider's. */
  readonly targetChainId: number | undefined;

  constructor(
    {
      operation,
      signerChainId,
      providerChainId,
      targetChainId,
    }: {
      operation: string;
      signerChainId: number;
      providerChainId: number;
      targetChainId?: number;
    },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.ChainMismatch,
      targetChainId === undefined
        ? `Operation "${operation}" requires signer and provider to be on the same chain, ` +
            `but signer is on chain ${signerChainId} and provider is on chain ${providerChainId}.`
        : `Operation "${operation}" targets chain ${targetChainId}, but signer is on chain ${signerChainId}.`,
      options,
    );
    this.name = "ChainMismatchError";
    this.operation = operation;
    this.signerChainId = signerChainId;
    this.providerChainId = providerChainId;
    this.targetChainId = targetChainId;
  }
}
