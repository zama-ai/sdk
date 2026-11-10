import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

/** Whether a join deposits the group's asset or redeems a vault's shares. */
export type Direction = "deposit" | "redeem";

/**
 * A batch's lifecycle state, in the contract's own words:
 * `pending` → `dispatched` → `finalized`, or `canceled`.
 */
export type BatchState = "pending" | "dispatched" | "finalized" | "canceled";

/** One vault's share of a join: the batcher it joined and the batch it landed in. */
export interface JoinLeg<TVaultId extends string = string> {
  /** The vault this leg joined. */
  readonly vaultId: TVaultId;
  /** The batcher it joined: the vault's deposit or redeem batcher. */
  readonly batcher: Address;
  /** The batch it landed in. */
  readonly batchId: bigint;
}

/**
 * Every leg of one join, decoys included. The value a host stores to read and
 * exit a position later. It never names the chosen vault or the amount.
 *
 * `client.deposit` and `client.redeem` return it. A host that sends the calls
 * itself builds it from its indexer's `Joined` events: one leg per vault of
 * the group, in config order.
 */
export interface JoinRecord<TGroupId extends string = string, TVaultId extends string = string> {
  /** The format version. */
  readonly v: 1;
  /** The chain the batchers are on. */
  readonly chainId: number;
  /** The group joined. */
  readonly groupId: TGroupId;
  /** Whether the join deposited or redeemed. */
  readonly direction: Direction;
  /** The account the batchers credited. */
  readonly account: Address;
  /** One leg per vault of the group, in config order. */
  readonly legs: readonly JoinLeg<TVaultId>[];
}

interface LegBase<TVaultId extends string> extends JoinLeg<TVaultId> {
  /** The account's encrypted deposit in this batch. An exit leaves an encrypted zero. */
  readonly deposit: EncryptedValue;
  /** The decrypted deposit, or `null` when the position was read without `decrypt`. */
  readonly amount: bigint | null;
}

/** One leg as read from chain, with what its state allows. Timestamps are chain seconds. */
export type Leg<TVaultId extends string = string> = LegBase<TVaultId> &
  (
    | {
        readonly state: "pending";
        /** When anyone may dispatch the batch. */
        readonly dispatchableAt: bigint;
        /** A paused batcher cannot dispatch. */
        readonly paused: boolean;
      }
    | {
        readonly state: "dispatched";
        /** From then on, finalizing cancels the batch instead of settling it. */
        readonly cancelsAt: bigint;
      }
    | {
        readonly state: "finalized";
        /** A claim pays `deposit * rate / 10 ** decimals`, rounded down. */
        readonly exchangeRate: { readonly rate: bigint; readonly decimals: number };
      }
    | { readonly state: "canceled" }
  );

/**
 * Where a join is, taken over all its legs.
 *
 * - `queued`: every leg is pending.
 * - `settling`: some leg is dispatched. Only `finalize` applies.
 * - `ready`: no leg is dispatched and some leg is finalized or canceled. `exit` pays out or refunds.
 * - `closed`: read with `decrypt`, and every deposit is zero: the position was exited.
 *
 * Without `decrypt`, an exited position still reads `ready` (or `queued`), and
 * `exit` stays available. Exits are idempotent on chain, so sending it again
 * moves nothing.
 */
export type PositionPhase = "queued" | "settling" | "ready" | "closed";

/** What can be sent for a position right now. Each maps to a client method that takes the record. */
export type VaultAction = "exit" | "dispatch" | "finalize";

/** A join record read from chain. */
export interface Position<TGroupId extends string = string, TVaultId extends string = string> {
  /** The join read. */
  readonly record: JoinRecord<TGroupId, TVaultId>;
  /** Where the join is, over all its legs. */
  readonly phase: PositionPhase;
  /** One per record leg, in the same order. */
  readonly legs: readonly Leg<TVaultId>[];
  /** The actions legal now. */
  readonly availableActions: readonly VaultAction[];
  /** The leg with a non-zero deposit, after a read with `decrypt`. Never stored in the record. */
  readonly chosenVaultId: TVaultId | null;
  /** The block timestamp the read was made at. */
  readonly observedAt: bigint;
  /** The next chain time at which `availableActions` can change on its own, or `null`. */
  readonly nextChangeAt: bigint | null;
}

/** The open batch of one vault, for a form that shows when the next batch closes. */
export interface OpenBatch<TVaultId extends string = string> {
  /** The vault. */
  readonly vaultId: TVaultId;
  /** Its batcher for the direction read. */
  readonly batcher: Address;
  /** The open batch, which the next join lands in. */
  readonly batchId: bigint;
  /** When anyone may dispatch the batch. */
  readonly dispatchableAt: bigint;
  /** A paused batcher takes no join and no dispatch. */
  readonly paused: boolean;
}

/** A call ready for any transaction pipeline. */
export interface VaultCall {
  /** The contract called. */
  readonly to: Address;
  /** The encoded calldata. Send it with no value. */
  readonly data: Hex;
}

/**
 * What a `prepare*` method returns: plain data, safe to store and to send
 * through a host's own pipeline. Send every grant before the calls.
 */
export interface PreparedVaultAction<TGroupId extends string = string> {
  /** The format version. */
  readonly v: 1;
  /** The client method that prepared it. */
  readonly kind: "deposit" | "redeem" | "exit" | "dispatch" | "finalize";
  /** The chain to send the calls on. */
  readonly chainId: number;
  /** The group acted on. */
  readonly groupId: TGroupId;
  /** The account that must send the calls, or `null` when anyone may. */
  readonly sender: Address | null;
  /** ERC-7984 operator grants the account lacks. Idempotent; send them first, in any order. */
  readonly grants: readonly VaultCall[];
  /** At least one call. */
  readonly calls: readonly VaultCall[];
  /**
   * `true` when the calls must land in one atomic bundle: the per-vault legs
   * of an `"atomic"` join. Sent one by one, a user who stops partway reveals
   * the vaults the rest would have named.
   */
  readonly atomic: boolean;
  /** When the earliest grant expires, in chain seconds. Prepare again after it. `null` without grants. */
  readonly expiresAt: bigint | null;
}

/** Checks a `prepare*` method may skip. A paused batcher is never skipped. */
export type VaultCheck = "balance" | "config";

/** Options for `prepareDeposit` and `prepareRedeem`. */
export interface PrepareJoinOptions {
  /** The account the join comes from. Defaults to the signer's. */
  readonly account?: Address;
  /**
   * `"sequential"` (default): one router call in a multi-vault group, for a
   * wallet that sends calls one by one. `"atomic"`: one transfer per vault and
   * no grants, for a wallet that bundles them atomically.
   */
  readonly walletMode?: "sequential" | "atomic";
  /**
   * `"balance"`: skip the balance check, which decrypts as the signer, so it
   * is required for any other `account`. `"config"`: skip the one-time check
   * of the config against the chain.
   */
  readonly skipChecks?: readonly VaultCheck[];
  /** How long a grant lasts. Defaults to 3600 seconds. */
  readonly grantValiditySeconds?: number;
}

/** Options for `client.deposit` and `client.redeem`. */
export interface JoinOptions extends Pick<
  PrepareJoinOptions,
  "skipChecks" | "grantValiditySeconds"
> {
  /**
   * Called with the join's transaction hash once the wallet has sent it,
   * before the SDK waits for the receipt.
   */
  readonly onJoinSubmitted?: (txHash: Hex) => void;
}

/** What `client.deposit` and `client.redeem` return. */
export interface JoinOutcome<TGroupId extends string = string, TVaultId extends string = string> {
  /** Store it to read and exit the position later. */
  readonly record: JoinRecord<TGroupId, TVaultId>;
  /** Every transaction sent, grants first. */
  readonly txHashes: readonly Hex[];
}

/** What `client.exit`, `client.dispatch` and `client.finalize` return. */
export interface ActionOutcome {
  /** Every transaction sent, in order. */
  readonly txHashes: readonly Hex[];
}
