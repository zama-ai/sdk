import type { Address } from "viem";
import { ZamaError, ZamaErrorCode } from "./base";

/**
 * A confidential token is not listed in the registry the vault router checks,
 * so the router would reject a transfer of it.
 *
 * The registry is governed on chain and can list or revoke a wrapper at any
 * time, so this is a live answer rather than a permanent verdict.
 */
export class UnlistedConfidentialTokenError extends ZamaError {
  /** The confidential token the registry does not list. */
  readonly token: Address;
  /** The registry that was asked. */
  readonly registry: Address;

  constructor(
    message: string,
    details: { token: Address; registry: Address },
    options?: ErrorOptions,
  ) {
    super(ZamaErrorCode.UnlistedConfidentialToken, message, options);
    this.name = "UnlistedConfidentialTokenError";
    this.token = details.token;
    this.registry = details.registry;
  }
}
