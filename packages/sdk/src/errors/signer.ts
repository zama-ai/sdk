import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Base class for signer/account readiness failures.
 */
export class SignerRequiredError extends ZamaError {
  readonly operation: string | undefined;

  constructor(
    code: ZamaErrorCode,
    message: string,
    options?: ErrorOptions & { operation?: string },
  ) {
    super(code, message, options);
    this.name = "SignerRequiredError";
    this.operation = options?.operation;
  }
}

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
 *   if (e instanceof SignerNotConfiguredError) {
 *     // Fix SDK/provider configuration.
 *   }
 * }
 * ```
 */
export class SignerNotConfiguredError extends SignerRequiredError {
  constructor(options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerNotConfigured,
      "Signer not configured. Configure one via ZamaSDKConfig.signer or createConfig({ signer: ... }).",
      options,
    );
    this.name = "SignerNotConfiguredError";
  }
}

/** Thrown when a signer exists but no wallet account is currently connected. */
export class WalletNotConnectedError extends SignerRequiredError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WalletNotConnected,
      `Cannot ${operation} without a connected wallet account.`,
      { ...options, operation },
    );
    this.name = "WalletNotConnectedError";
  }
}

/** Thrown when an async adapter has not resolved its initial wallet account yet. */
export class WalletAccountNotReadyError extends SignerRequiredError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WalletAccountNotReady,
      `Cannot ${operation} before the wallet account is ready.`,
      { ...options, operation },
    );
    this.name = "WalletAccountNotReadyError";
  }
}
