import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Thrown when a wallet-dependent operation (write, decrypt, signature) is
 * invoked on a {@link ZamaSDK} configured without a {@link GenericSigner}.
 *
 * The SDK can be constructed with only a {@link GenericProvider} for
 * read-only integrations (indexers, SSR, dApps pre-connect). Attempting
 * a wallet-bound operation in that mode surfaces this error instead of
 * a generic `TypeError`.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0x…", 1n);
 * } catch (e) {
 *   if (e instanceof SignerRequiredError) {
 *     // Prompt the user to connect a wallet
 *   }
 * }
 * ```
 */
export class SignerRequiredError extends ZamaError {
  /** The operation that required a signer. */
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerRequired,
      `Operation "${operation}" requires a signer but ZamaSDK was configured without one. ` +
        `Pass \`signer\` to \`ZamaSDKConfig\` to enable wallet-bound operations.`,
      options,
    );
    this.name = "SignerRequiredError";
    this.operation = operation;
  }
}
