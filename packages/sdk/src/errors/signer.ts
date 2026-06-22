import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Base class for signer/account readiness failures.
 */
export class SignerRequiredError extends ZamaError {
  readonly operation: string;

  constructor(code: ZamaErrorCode, operation: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "SignerRequiredError";
    this.operation = operation;
  }
}

/**
 * Thrown when an operation requires a signer but none is configured.
 *
 * The SDK can be constructed without a signer. Operations that need wallet
 * authority throw this before probing wallet state.
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
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerNotConfigured,
      operation,
      `Cannot ${operation} without a signer. Configure one via createConfig({ signer: ... }) or <ZamaProvider config={createConfig({ signer: ... })}>.`,
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
      operation,
      `Cannot ${operation} without a connected wallet account.`,
      options,
    );
    this.name = "WalletNotConnectedError";
  }
}

/** Thrown when an async adapter has not resolved its initial wallet account yet. */
export class WalletAccountNotReadyError extends SignerRequiredError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WalletAccountNotReady,
      operation,
      `Cannot ${operation} before the wallet account is ready.`,
      options,
    );
    this.name = "WalletAccountNotReadyError";
  }
}

/**
 * Narrow a nullable signer-dependent value or throw {@link SignerNotConfiguredError}.
 */
export function requireConfigured<T>(value: T, operation: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new SignerNotConfiguredError(operation);
  }
  return value as NonNullable<T>;
}
