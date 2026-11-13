import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

/** Whether a join deposits the confidential asset or redeems a vault's confidential shares. */
export type JoinDirection = "deposit" | "redeem";

/** A batch's state, named as the batcher contract names it. */
export type BatchState = "pending" | "dispatched" | "finalized" | "canceled";

/** One EVM call, encoded. */
export interface Call {
  /** The contract called. */
  readonly to: Address;
  /** The encoded calldata. */
  readonly data: Hex;
  /** Vault calls never carry value. */
  readonly value: 0n;
}

/** One vault's part of a join. */
export interface VaultLeg {
  /** The vault this leg joins. */
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
  /** Tells an operator approval from a join without decoding the calldata. */
  readonly kind: "operatorApproval";
  /** The vault whose token the approval is on. */
  readonly vaultId: string;
  /** The router. */
  readonly operator: Address;
  /** When the approval expires, in chain seconds. */
  readonly until: bigint;
}

/** A join call. */
export interface JoinCall extends Call {
  /** Tells a join from an operator approval without decoding the calldata. */
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
  /** Whether it deposits or redeems. */
  readonly direction: JoinDirection;
  /** The chain to send the calls on. */
  readonly chainId: number;
  /** The group joined, or `undefined` for a vault joined on its own. */
  readonly groupId: string | undefined;
  /** The vault that receives the amount. */
  readonly vaultId: string;
  /** The account that must send the calls: their encryption proofs are bound to it. */
  readonly account: Address;
  /** The amount, in the asset for a deposit and in shares for a redeem. */
  readonly amount: bigint;
  /** How the calls reach the batchers. */
  readonly route: JoinRoute;
  /** Every vault joined, in group order, the zero legs included. */
  readonly legs: readonly [VaultLeg, ...VaultLeg[]];
  /**
   * Every call in send order: the operator approvals the account lacks, in leg
   * order, then the joins.
   */
  readonly calls: readonly [VaultCall, ...VaultCall[]];
}

/** What `prepareDeposit` and `prepareRedeem` take for a vault on its own. */
export interface JoinInput {
  /** The account that will send the calls. */
  readonly account: Address;
  /** Plaintext, in the asset for a deposit and in shares for a redeem. */
  readonly amount: bigint;
}

/** What `prepareDeposit` and `prepareRedeem` take for a group. */
export interface GroupJoinInput<TVaultId extends string = string> extends JoinInput {
  /** The vault of the group the amount goes to. */
  readonly vaultId: TVaultId;
}

/** Options for `prepareDeposit` and `prepareRedeem`. */
export interface JoinOptions {
  /** Skip the balance check, which decrypts as the signer. A paused batcher is always checked. */
  readonly skipBalanceCheck?: boolean;
}

/** Options for `prepareDeposit` and `prepareRedeem` into a group. */
export interface GroupJoinOptions extends JoinOptions {
  /** Defaults to `"router"`. */
  readonly route?: JoinRoute;
}

/** A batch on one batcher. */
export interface BatchRef {
  /** The chain the batcher is on. */
  readonly chainId: number;
  /** The batcher the batch is on. */
  readonly batcher: Address;
  /** The batch's id on that batcher. */
  readonly batchId: bigint;
}

/** A batcher on one chain. */
export type BatcherRef = Pick<BatchRef, "chainId" | "batcher">;

/** Options for `deposit` and `redeem`. */
export interface SendJoinOptions {
  /** Skip the balance check. A paused batcher is always checked. */
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
  /** The vault whose open batch this is. */
  readonly vaultId: string;
  /** The time from which anyone may dispatch the batch, in chain seconds. */
  readonly dispatchableAt: bigint;
  /** Whether the batcher is paused. */
  readonly paused: boolean;
  /** The block timestamp the read was made at. */
  readonly observedAt: bigint;
}

/** What `deposit` and `redeem` return. */
export interface JoinOutcome {
  /** The batch each leg landed in, in group order. */
  readonly batches: readonly (BatchRef & { readonly vaultId: string })[];
  /** Every transaction sent, operator approvals first. */
  readonly txHashes: readonly Hex[];
}
