import type { Address, Hex } from "viem";
import type { TransactionReceipt } from "../types/transaction";
import type { VaultGroupJoin } from "../vaults/vault-group";
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

/** What a {@link VaultGroupJoinUnconfirmedError} carries. */
export interface VaultGroupJoinUnconfirmedDetails {
  /** The mined transaction. */
  readonly txHash: Hex;
  /** Its receipt, for callers that want to inspect the logs themselves. */
  readonly receipt: TransactionReceipt;
  /** The legs whose batchers did report a join, so their batches can still be claimed or quit. */
  readonly joins: readonly VaultGroupJoin[];
  /** The ids of the members whose batchers reported no join. */
  readonly unconfirmed: readonly string[];
}

/**
 * A group submission was mined, but its receipt has no `Joined` event for at
 * least one leg. A reverted transaction ends here too, so look the transaction
 * up before resubmitting; `joins` names the batches that did take the join.
 */
export class VaultGroupJoinUnconfirmedError extends ZamaError {
  /** The mined transaction. */
  readonly txHash: Hex;
  /** Its receipt, for callers that want to inspect the logs themselves. */
  readonly receipt: TransactionReceipt;
  /** The legs whose batchers did report a join, so their batches can still be claimed or quit. */
  readonly joins: readonly VaultGroupJoin[];
  /** The ids of the members whose batchers reported no join. */
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
