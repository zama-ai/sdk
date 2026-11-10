import type { Address, Hex } from "viem";
import type { TransactionReceipt } from "../types/transaction";
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
 * so the router would reject a transfer of it.
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
  /** The vault whose leg needs it. */
  readonly vaultId: string;
}

/**
 * A batcher a join needs is paused, so the join would revert. A dispatch
 * skips paused batchers instead. Pausing gates `join` and `dispatchBatch`; quitting
 * and claiming on it still work.
 */
export class VaultBatcherPausedError extends ZamaError {
  /** The batcher that reported `paused()`. */
  readonly batcher: Address;
  /** The vault whose leg needs it. */
  readonly vaultId: string;

  constructor(message: string, details: VaultBatcherPausedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultBatcherPaused, message, options);
    this.name = "VaultBatcherPausedError";
    this.batcher = details.batcher;
    this.vaultId = details.vaultId;
  }
}

/** Why a vault action cannot be sent now. */
export type VaultActionNotAllowedReason =
  /** An exit was asked for while a leg is dispatched; only `finalize` applies until it settles. */
  | "leg-dispatched"
  /** A dispatch was asked for, but no leg is pending, old enough, and on an unpaused batcher. */
  | "nothing-to-dispatch"
  /** A finalize was asked for, but no leg is dispatched. */
  | "nothing-to-finalize";

/** What a {@link VaultActionNotAllowedError} carries. */
export interface VaultActionNotAllowedDetails {
  /** The action asked for. */
  readonly action: "exit" | "dispatch" | "finalize";
  /** Why the position does not allow it now. */
  readonly reason: VaultActionNotAllowedReason;
}

/**
 * The position's batches do not allow the action now, usually because their
 * state moved since the position was read. Read the position again.
 */
export class VaultActionNotAllowedError extends ZamaError {
  /** The action asked for. */
  readonly action: VaultActionNotAllowedDetails["action"];
  /** Why the position does not allow it now. */
  readonly reason: VaultActionNotAllowedReason;

  constructor(message: string, details: VaultActionNotAllowedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultActionNotAllowed, message, options);
    this.name = "VaultActionNotAllowedError";
    this.action = details.action;
    this.reason = details.reason;
  }
}

/** What a {@link VaultJoinUnconfirmedError} carries. */
export interface VaultJoinUnconfirmedDetails {
  /** The mined join transaction. */
  readonly txHash: Hex;
  /** Its receipt, to inspect the logs. */
  readonly receipt: TransactionReceipt;
  /** The vaults whose `Joined` log the SDK could not match. Not a list of legs that did not join. */
  readonly unconfirmedVaultIds: readonly string[];
}

/**
 * A join was mined, but the SDK could not match a `Joined` log to every leg,
 * so it cannot build the join record. A router join is all-or-nothing, so
 * every leg most likely joined; look the transaction up before joining again.
 */
export class VaultJoinUnconfirmedError extends ZamaError {
  /** The mined join transaction. */
  readonly txHash: Hex;
  /** Its receipt, to inspect the logs. */
  readonly receipt: TransactionReceipt;
  /** The vaults whose `Joined` log the SDK could not match. Not a list of legs that did not join. */
  readonly unconfirmedVaultIds: readonly string[];

  constructor(message: string, details: VaultJoinUnconfirmedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultJoinUnconfirmed, message, options);
    this.name = "VaultJoinUnconfirmedError";
    this.txHash = details.txHash;
    this.receipt = details.receipt;
    this.unconfirmedVaultIds = details.unconfirmedVaultIds;
  }
}
