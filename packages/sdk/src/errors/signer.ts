import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Thrown when an operation requires a signer but none is configured.
 *
 * The SDK can be constructed without a signer. Operations that need wallet
 * authority throw this when accessed.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0xTo", 100n);
 * } catch (e) {
 *   if (e instanceof SignerRequiredError) {
 *     // Fix SDK/provider configuration.
 *   }
 * }
 * ```
 */
export class SignerRequiredError extends ZamaError {
  constructor(options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerRequired,
      "Signer not configured. Configure one via ZamaSDKConfig.signer or createConfig({ signer: ... }).",
      options,
    );
    this.name = "SignerRequiredError";
  }
}

/** Thrown when a signer exists but no wallet account is currently connected. */
export class WalletNotConnectedError extends ZamaError {
  constructor(options?: ErrorOptions) {
    super(ZamaErrorCode.WalletNotConnected, "No connected wallet account.", options);
    this.name = "WalletNotConnectedError";
  }
}

/** Thrown when an async adapter has not resolved its initial wallet account yet. */
export class WalletAccountNotReadyError extends ZamaError {
  constructor(options?: ErrorOptions) {
    super(ZamaErrorCode.WalletAccountNotReady, "Wallet account is not ready yet.", options);
    this.name = "WalletAccountNotReadyError";
  }
}
