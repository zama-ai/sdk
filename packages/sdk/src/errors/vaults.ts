import type { Address, Hex } from "viem";
import type { TransactionReceipt } from "../types/transaction";
import type { BatchState } from "../vaults/types";
import { ZamaError, ZamaErrorCode } from "./base";

export interface VaultBatcherPausedDetails {
  readonly batcher: Address;
  readonly vaultId: string;
}

/** A batcher that a join needs is paused. */
export class VaultBatcherPausedError extends ZamaError {
  readonly batcher: Address;
  /** The vault whose leg needs the batcher. */
  readonly vaultId: string;

  constructor(message: string, details: VaultBatcherPausedDetails, options?: ErrorOptions) {
    super(ZamaErrorCode.VaultBatcherPaused, message, options);
    this.name = "VaultBatcherPausedError";
    this.batcher = details.batcher;
    this.vaultId = details.vaultId;
  }
}

export interface VaultBatchNotDispatchedDetails {
  readonly batcher: Address;
  readonly batchId: bigint;
  readonly state: BatchState;
}

/** The batch to finalize is not dispatched. */
export class VaultBatchNotDispatchedError extends ZamaError {
  readonly batcher: Address;
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

export interface VaultJoinUnconfirmedDetails {
  readonly txHash: Hex;
  readonly receipt: TransactionReceipt;
  readonly unconfirmedVaultIds: readonly string[];
}

/**
 * A join was mined, but the SDK could not match a `Joined` log to every leg.
 */
export class VaultJoinUnconfirmedError extends ZamaError {
  /** The mined join transaction. */
  readonly txHash: Hex;
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
