import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

/** Whether a join deposits the confidential asset or redeems a vault's confidential shares. */
export type JoinDirection = "deposit" | "redeem";

/** A batch's state, named as the batcher contract names it. */
export type BatchState = "pending" | "dispatched" | "finalized" | "canceled";

/** One EVM call, encoded. */
export interface Call {
  readonly to: Address;
  /** The encoded calldata. */
  readonly data: Hex;
  readonly value: 0n;
}

/** One vault's part of a join. */
export interface VaultLeg {
  readonly vaultId: string;
  /** The vault's active batcher when the join was prepared. */
  readonly batcher: Address;
  /** The confidential token the leg spends: the asset for a deposit, the vault's share for a redeem. */
  readonly token: Address;
  /** The chosen vault's amount, zero for every other leg. */
  readonly amount: bigint;
}

/** An ERC-7984 operator approval a join relies on, sent to the token it is on. */
export interface OperatorApprovalCall extends Call {
  readonly kind: "operatorApproval";
  /** The vault whose token the approval is on. */
  readonly vaultId: string;
  /** The router. */
  readonly operator: Address;
  /** When the approval expires, in chain seconds. */
  readonly until: bigint;
}

export interface JoinCall extends Call {
  readonly kind: "join";
  /** The leg this call funds; for a router call, the chosen vault's leg. */
  readonly leg: VaultLeg;
}

/** A call of a prepared join. */
export type VaultCall = OperatorApprovalCall | JoinCall;

/**
 * How a join reaches the batchers.
 *
 * - `"router"`: one call through the router.
 * - `"direct"`: one call per leg, straight to each batcher, with no operator approval.
 */
export type JoinRoute = "direct" | "router";

/** A join built but not sent. */
export interface PreparedJoin {
  readonly direction: JoinDirection;
  /** The chain to send the calls on. */
  readonly chainId: number;
  /** The group joined, or `undefined` for a vault joined on its own. */
  readonly groupId: string | undefined;
  /** The vault that receives the amount. */
  readonly vaultId: string;
  readonly account: Address;
  /** The amount, in the asset for a deposit and in shares for a redeem. */
  readonly amount: bigint;
  readonly route: JoinRoute;
  /** Every vault joined, in group order, the zero legs included. */
  readonly legs: readonly [VaultLeg, ...VaultLeg[]];
  /**
   * Every call in send order: the operator approvals the account lacks, in leg
   * order, then the joins.
   */
  readonly calls: readonly [VaultCall, ...VaultCall[]];
}

export interface JoinInput {
  /** The account that will send the calls. */
  readonly account: Address;
  /** Plaintext, in the asset for a deposit and in shares for a redeem. */
  readonly amount: bigint;
}

export interface GroupJoinInput<TVaultId extends string = string> extends JoinInput {
  /** The vault of the group the amount goes to. */
  readonly vaultId: TVaultId;
}

export interface JoinOptions {
  readonly skipBalanceCheck?: boolean;
}

export interface GroupJoinOptions extends JoinOptions {
  /** Defaults to `"router"`. */
  readonly route?: JoinRoute;
}

/** A batch on one batcher. */
export interface BatchRef {
  /** The chain the batcher is on. */
  readonly chainId: number;
  readonly batcher: Address;
  readonly batchId: bigint;
}

/** A batcher on one chain. */
export type BatcherRef = Pick<BatchRef, "chainId" | "batcher">;

export interface SendJoinOptions {
  readonly skipBalanceCheck?: boolean;
  /** Called with the join's transaction hash once the wallet has sent it, before the SDK waits for the receipt. */
  readonly onJoinSubmitted?: (txHash: Hex) => void;
}

/** A settlement built but not sent. */
export interface PreparedFinalize extends BatchRef {
  /** The publicly decrypted amount the batch's unwrap released. */
  readonly unwrapAmountCleartext: bigint;
  /** The proof of that decryption. */
  readonly decryptionProof: Hex;
  /** The `dispatchBatchCallback` call. */
  readonly call: Call;
}

/** An operation that can be sent for a batch. */
export type BatchAction = "claim" | "quit" | "dispatch" | "finalize";

interface BatchBase extends BatchRef {
  /** The time the batch opened, in chain seconds. */
  readonly createdAt: bigint;
  /** The time from which anyone may dispatch it, in chain seconds, fixed when it opened. */
  readonly dispatchableAt: bigint;
  /** Whether the batcher is paused. */
  readonly paused: boolean;
  /** The account's encrypted deposit, or `null` when no account was given. */
  readonly deposit: EncryptedValue | null;
  /** What can be sent at `observedAt`. */
  readonly actions: readonly BatchAction[];
  /** The block timestamp the read was made at. */
  readonly observedAt: bigint;
  /** The next chain time at which `actions` can change on its own, or `null`. */
  readonly nextChangeAt: bigint | null;
}

interface DispatchedTimes {
  /** When it was dispatched, in chain seconds. */
  readonly dispatchedAt: bigint;
  /** The time after which the batch can no longer settle, in chain seconds. */
  readonly cancelsAt: bigint;
}

/** One batch as read from chain. */
export type Batch =
  | (BatchBase & { readonly state: "pending" })
  | (BatchBase & DispatchedTimes & { readonly state: "dispatched" | "canceled" })
  | (BatchBase &
      DispatchedTimes & {
        readonly state: "finalized";
        /** The rate as a fixed-point number: `rate / 10 ** decimals`. */
        readonly exchangeRate: { readonly rate: bigint; readonly decimals: number };
      });

/** The open batch of one vault's active batcher. */
export interface OpenBatch extends BatchRef {
  readonly vaultId: string;
  /** The time from which anyone may dispatch the batch, in chain seconds. */
  readonly dispatchableAt: bigint;
  /** Whether the batcher is paused. */
  readonly paused: boolean;
  /** The block timestamp the read was made at. */
  readonly observedAt: bigint;
}

export interface JoinOutcome {
  /** The batch each leg landed in, in group order. */
  readonly batches: readonly (BatchRef & { readonly vaultId: string })[];
  /** Every transaction sent, operator approvals first. */
  readonly txHashes: readonly Hex[];
}
