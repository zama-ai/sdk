import type { Address, Hex } from "viem";
import type { TransactionReceipt } from "../types/transaction";
import type { BatchState } from "../vaults/types";
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
 * A batcher a join needs is paused, so the join would revert. Pausing gates
 * `join` and `dispatchBatch`; quitting and claiming on it still work.
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
 * A batch cannot be finalized because it is not dispatched: it is still
 * pending, or a keeper or anyone else already settled or canceled it.
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
 * so it cannot tell which batch each leg landed in. A router join is all-or-nothing, so
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
