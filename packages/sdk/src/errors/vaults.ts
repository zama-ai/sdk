import type { Address, Hex } from "viem";
import type { TransactionReceipt } from "../types/transaction";
import type { BatchState } from "../vaults/types";
import type { VaultGroupJoin } from "../vaults/vault-group-types";
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
  /** The id of the group member whose leg would have joined it. */
  readonly vaultId: string;
}

/**
 * A batcher one leg of a group submission would join is paused, so the whole
 * submission would revert. Pausing gates `join` and `dispatchBatch`; quitting
 * and claiming on it still work.
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

/** What a {@link VaultBatchNotDispatchedError} carries. */
export interface VaultBatchNotDispatchedDetails {
  /** The batcher the batch belongs to. */
  readonly batcher: Address;
  /** The batch that was to be finalized. */
  readonly batchId: bigint;
  /** The state the batch is in instead. */
  readonly state: BatchState;
}

/**
 * A batch cannot be finalized because it is not `Dispatched`: it is still
 * open, or it was already settled or canceled, by a keeper or anyone else.
 */
export class VaultBatchNotDispatchedError extends ZamaError {
  /** The batcher the batch belongs to. */
  readonly batcher: Address;
  /** The batch that was to be finalized. */
  readonly batchId: bigint;
  /** The state the batch is in instead. */
  readonly state: BatchState;

  constructor(message: string, details: VaultBatchNotDispatchedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultBatchNotDispatched, message, options);
    this.name = "VaultBatchNotDispatchedError";
    this.batcher = details.batcher;
    this.batchId = details.batchId;
    this.state = details.state;
  }
}

/** What a {@link VaultGroupJoinUnconfirmedError} carries. */
export interface VaultGroupJoinUnconfirmedDetails {
  /** The mined transaction. */
  readonly txHash: Hex;
  /** Its receipt, for callers that want to inspect the logs themselves. */
  readonly receipt: TransactionReceipt;
  /** The legs whose `Joined` log the SDK matched, with the batch each landed in. */
  readonly joins: readonly VaultGroupJoin[];
  /** The ids of the members whose `Joined` log the SDK could not match; not a list of legs that did not join. */
  readonly unconfirmed: readonly string[];
}

/**
 * A group submission was mined, but the SDK could not match a `Joined` event
 * in its receipt to every leg. The router is all-or-nothing, so either the
 * transaction reverted and nothing moved, or it succeeded and *every* leg
 * joined, the `unconfirmed` ones included; look the transaction up before
 * resubmitting. `joins` gives the batch ids the SDK could read.
 */
export class VaultGroupJoinUnconfirmedError extends ZamaError {
  /** The mined transaction. */
  readonly txHash: Hex;
  /** Its receipt, for callers that want to inspect the logs themselves. */
  readonly receipt: TransactionReceipt;
  /** The legs whose `Joined` log the SDK matched, with the batch each landed in. */
  readonly joins: readonly VaultGroupJoin[];
  /** The ids of the members whose `Joined` log the SDK could not match; not a list of legs that did not join. */
  readonly unconfirmed: readonly string[];

  constructor(message: string, details: VaultGroupJoinUnconfirmedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultGroupJoinUnconfirmed, message, options);
    this.name = "VaultGroupJoinUnconfirmedError";
    this.txHash = details.txHash;
    this.receipt = details.receipt;
    this.joins = details.joins;
    this.unconfirmed = details.unconfirmed;
  }
}
