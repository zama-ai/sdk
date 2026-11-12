import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

/** Whether a join deposits the confidential asset or redeems a vault's confidential shares. */
export type JoinDirection = "deposit" | "redeem";

/**
 * A batch's lifecycle state, in the contract's own words:
 * `pending` → `dispatched` → `finalized`, or `canceled`.
 */
export type BatchState = "pending" | "dispatched" | "finalized" | "canceled";

/** One EVM call, encoded. Vault calls never carry value. */
export interface Call {
  /** The contract called. */
  readonly to: Address;
  /** The encoded calldata. */
  readonly data: Hex;
  /** Always zero. */
  readonly value: 0n;
}

/** One vault's part of a join. Every vault of a group gets one, the unchosen ones with zero. */
export interface VaultLeg {
  /** The vault. */
  readonly vaultId: string;
  /** The vault's active batcher when the join was prepared. */
  readonly batcher: Address;
  /** The confidential token the leg spends: the asset for a deposit, the vault's share for a redeem. */
  readonly token: Address;
  /** The chosen vault's amount, zero for every other leg. */
  readonly amount: bigint;
}

/** An ERC-7984 operator approval a join relies on, sent to the token it is on. Present only when the account lacks it. */
export interface OperatorApprovalCall extends Call {
  /** Tells an operator approval from a join without decoding the calldata. */
  readonly kind: "operatorApproval";
  /** The vault whose token the approval is on. */
  readonly vaultId: string;
  /** The approved operator: the router. */
  readonly operator: Address;
  /** When the approval expires, in chain seconds. */
  readonly until: bigint;
}

/** A join call. */
export interface JoinCall extends Call {
  /** Tells a join from an operator approval without decoding the calldata. */
  readonly kind: "join";
  /** The leg this call funds. A router call funds every leg, and names the chosen one. */
  readonly leg: VaultLeg;
}

/** A call of a prepared join. `kind` tells an operator approval from a join without decoding the calldata. */
export type VaultCall = OperatorApprovalCall | JoinCall;

/**
 * How a join reaches the batchers.
 *
 * - `"router"`: one call through the router, after any operator approvals it needs.
 * - `"direct"`: one call per leg, straight to each batcher, with no operator approval.
 *   A vault joined on its own always takes it. In a group, send the calls in one
 *   atomic bundle: joining some vaults and not others shows which vault was chosen.
 */
export type JoinRoute = "direct" | "router";

/** A join built but not sent. Plain data: it survives `structuredClone`, but its bigints need a JSON replacer. */
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
   * Every call in send order: the operator approvals the account lacks, in
   * leg order, then the joins. With `route: "direct"` in a group of more than
   * one, send the joins as one atomic bundle.
   */
  readonly calls: readonly [VaultCall, ...VaultCall[]];
}

/** What `prepareDeposit` and `prepareRedeem` take for a vault on its own. */
export interface JoinInput {
  /** The account that will send the calls. */
  readonly account: Address;
  /** Plaintext; encrypted before it leaves the SDK. For a redeem, in shares. */
  readonly amount: bigint;
}

/** What `prepareDeposit` and `prepareRedeem` take for a group. */
export interface GroupJoinInput<TVaultId extends string = string> extends JoinInput {
  /** The vault of the group the amount goes to. */
  readonly vaultId: TVaultId;
}

/** Options for `prepareDeposit` and `prepareRedeem`. */
export interface JoinOptions {
  /**
   * Skip the balance check. It runs by default and decrypts as the signer, so
   * a join prepared for another account, or with no signer, must skip it and
   * check the balance itself. A paused batcher is always checked.
   */
  readonly skipBalanceCheck?: boolean;
}

/** Options for `prepareDeposit` and `prepareRedeem` into a group. */
export interface GroupJoinOptions extends JoinOptions {
  /** Defaults to `"router"`. */
  readonly route?: JoinRoute;
}

/** A batch on one batcher. Batchers rotate, so a batch is identified by its batcher, not its vault. */
export interface BatchRef {
  /** The chain the batcher is on. */
  readonly chainId: number;
  /** The batcher. */
  readonly batcher: Address;
  /** The batch. */
  readonly batchId: bigint;
}

/** A batcher on one chain. A dispatch takes it, because it acts on the batcher's open batch. */
export type BatcherRef = Pick<BatchRef, "chainId" | "batcher">;

/** Options for `deposit` and `redeem`. */
export interface SendJoinOptions {
  /** Skip the balance check, which runs by default. A paused batcher is always checked. */
  readonly skipBalanceCheck?: boolean;
  /** Called with the join's transaction hash once the wallet has sent it, before the SDK waits for the receipt. */
  readonly onJoinSubmitted?: (txHash: Hex) => void;
}

/** A settlement built but not sent. */
export interface PreparedFinalize extends BatchRef {
  /** The publicly decrypted amount the batch's unwrap released. */
  readonly unwrapAmountCleartext: bigint;
  /** The proof of that decryption, which the batcher verifies. */
  readonly decryptionProof: Hex;
  /** The `dispatchBatchCallback` call. */
  readonly call: Call;
}

/** What can be sent for a batch now. */
export type BatchAction = "claim" | "quit" | "dispatch" | "finalize";

interface BatchBase extends BatchRef {
  /** When the batch opened. */
  readonly createdAt: bigint;
  /** When anyone may dispatch it, pinned when it opened. */
  readonly dispatchableAt: bigint;
  /** Whether the batcher is paused. A paused batcher takes no join and no dispatch. */
  readonly paused: boolean;
  /** The account's encrypted deposit, or `null` when the read named no account. A claim or quit leaves an encrypted zero. */
  readonly deposit: EncryptedValue | null;
  /**
   * What can be sent now. `quit` needs the depositor as sender; the others are
   * permissionless, and a keeper normally sends them. Without an account, only
   * `dispatch` and `finalize` are listed.
   */
  readonly actions: readonly BatchAction[];
  /** The block timestamp the read was made at. */
  readonly observedAt: bigint;
  /** The next chain time at which `actions` can change on its own, or `null`. */
  readonly nextChangeAt: bigint | null;
}

interface DispatchedTimes {
  /** When it was dispatched. */
  readonly dispatchedAt: bigint;
  /** From then on, finalizing cancels it instead of settling it. */
  readonly cancelsAt: bigint;
}

/** One batch as read from chain, with the fields its state has. Timestamps are chain seconds. */
export type Batch =
  | (BatchBase & { readonly state: "pending" })
  | (BatchBase & DispatchedTimes & { readonly state: "dispatched" | "canceled" })
  | (BatchBase &
      DispatchedTimes & {
        readonly state: "finalized";
        /** A claim pays `deposit * rate / 10 ** decimals`, rounded down. */
        readonly exchangeRate: { readonly rate: bigint; readonly decimals: number };
      });

/** The open batch of one vault's active batcher. */
export interface OpenBatch extends BatchRef {
  /** The vault. */
  readonly vaultId: string;
  /** When anyone may dispatch the batch. */
  readonly dispatchableAt: bigint;
  /** A paused batcher takes no join and no dispatch. */
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
