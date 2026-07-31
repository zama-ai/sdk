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

/**
 * Thrown when broadcasting a prepared offline transaction whose bound chain no
 * longer matches the provider's current chain.
 *
 * The offline pipeline (`prepare → sign → broadcast`) exists precisely because
 * time passes between phases, and the caller may switch networks in the gap.
 * The chain ID is baked into the signed bytes at `prepare` time, so `broadcast`
 * re-checks it before sending: submitting a transaction bound to chain X while
 * the provider is on chain Y would either be rejected by the RPC or, worse,
 * replay onto the wrong network. Unlike {@link ChainMismatchError}, no signer
 * is involved — the transaction is already signed — so recover by re-preparing
 * against the current chain rather than by reconnecting a wallet.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.offline.broadcast(prepared, signedTx);
 * } catch (e) {
 *   if (e instanceof PreparedChainMismatchError) {
 *     console.error(
 *       `Prepared for chain ${e.preparedChainId} but provider is on ${e.providerChainId}; re-prepare.`,
 *     );
 *   }
 * }
 * ```
 */
export class PreparedChainMismatchError extends ZamaError {
  /** Name of the operation that triggered the check. */
  readonly operation: string;
  /** Chain ID the prepared transaction is bound to. */
  readonly preparedChainId: number;
  /** Chain ID the provider is currently connected to. */
  readonly providerChainId: number;

  constructor(
    {
      operation,
      preparedChainId,
      providerChainId,
    }: { operation: string; preparedChainId: number; providerChainId: number },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.PreparedChainMismatch,
      `Cannot ${operation}: the prepared transaction is bound to chain ${preparedChainId}, ` +
        `but the provider is on chain ${providerChainId}. Re-prepare against the current chain.`,
      options,
    );
    this.name = "PreparedChainMismatchError";
    this.operation = operation;
    this.preparedChainId = preparedChainId;
    this.providerChainId = providerChainId;
  }
}
