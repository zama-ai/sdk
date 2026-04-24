import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Thrown when an operation requires a signer but none is configured.
 *
 * The SDK can be constructed without a signer (for read-only usage such as
 * indexers, SSR, or pre-wallet-connect states). Operations that need wallet
 * authority — writes, EIP-712 signatures, user decrypt, credentials/session
 * management — throw `SignerRequiredError` instead of probing the signer.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0xTo", 100n);
 * } catch (e) {
 *   if (e instanceof SignerRequiredError) {
 *     // Prompt the user to connect their wallet.
 *   }
 * }
 * ```
 */
export class SignerRequiredError extends ZamaError {
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerRequired,
      `Cannot ${operation} without a signer. Configure one via ZamaSDKConfig.signer or <ZamaProvider signer={...}>.`,
      options,
    );
    this.name = "SignerRequiredError";
    this.operation = operation;
  }
}
