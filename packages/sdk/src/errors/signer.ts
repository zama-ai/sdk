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
 * Capabilities a {@link GenericSigner} may declare. `writeContract` covers
 * atomic broadcast-from-wallet flows; `signTransaction` covers the deferred
 * custodian path where the SDK builds an unsigned tx, the signer returns
 * signed bytes, and the SDK broadcasts via `provider.sendRawTransaction`.
 */
export type SignerCapability = "writeContract" | "signTransaction";

/**
 * Thrown when an operation needs a signer capability that the configured
 * signer does not expose — e.g. calling an atomic write op on a
 * broadcast-only signer that has `signTransaction` but no `writeContract`.
 *
 * Distinct from {@link SignerNotConfiguredError}: a signer *is* configured
 * but cannot perform the requested operation. The operation may be available
 * via the deferred `prepare* / complete*` path instead.
 */
export class SignerCapabilityError extends SignerRequiredError {
  readonly capability: SignerCapability;

  constructor(operation: string, capability: SignerCapability, options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerMissingCapability,
      operation,
      `Cannot ${operation}: the configured signer does not implement ${capability}. ` +
        (capability === "writeContract"
          ? "Use the deferred prepare*/complete* path, or configure an atomic signer."
          : "Configure a signer that supports offline signing (e.g. BroadcastSigner)."),
      options,
    );
    this.name = "SignerCapabilityError";
    this.capability = capability;
  }
}
