import type { Address } from "viem";
import { ZamaError, ZamaErrorCode } from "./base";

/** What an {@link UnlistedConfidentialTokenError} carries. */
export interface UnlistedConfidentialTokenDetails {
  /** The confidential token the registry does not list. */
  readonly token: Address;
  /** The token wrapper registry the router checks. */
  readonly registry: Address;
}

/**
 * A confidential token is not listed in the registry the vault router checks,
 * so the router would reject a transfer of it. Listings are governed on chain
 * and can change, so this is a live answer, not a permanent verdict.
 */
export class UnlistedConfidentialTokenError extends ZamaError {
  /** The confidential token the registry does not list. */
  readonly token: Address;
  /** The token wrapper registry the router checks. */
  readonly registry: Address;

  constructor(message: string, details: UnlistedConfidentialTokenDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.UnlistedConfidentialToken, message, options);
    this.name = "UnlistedConfidentialTokenError";
    this.token = details.token;
    this.registry = details.registry;
  }
}

/** What a {@link VaultBatcherPausedError} carries. */
export interface VaultBatcherPausedDetails {
  /** The batcher that reported `paused()`. */
  readonly batcher: Address;
  /** The id of the group member whose leg would have joined it. */
  readonly vaultId: string;
}

/**
 * A batcher one leg of a group submission would join is paused, so the whole
 * submission would revert: every member is joined in one transaction, and a
 * paused batcher rejects `join`. Quitting and claiming on it still work.
 */
export class VaultBatcherPausedError extends ZamaError {
  /** The batcher that reported `paused()`. */
  readonly batcher: Address;
  /** The id of the group member whose leg would have joined it. */
  readonly vaultId: string;

  constructor(message: string, details: VaultBatcherPausedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultBatcherPaused, message, options);
    this.name = "VaultBatcherPausedError";
    this.batcher = details.batcher;
    this.vaultId = details.vaultId;
  }
}
