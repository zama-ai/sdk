import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import type { VaultGroup, VaultIdOf, VaultTarget } from "./config";

/** Whether a join deposits the group's asset or redeems a vault's shares. */
export type Direction = "deposit" | "redeem";

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

/** One vault's share of a join. Every vault of the group gets one, the unchosen ones with zero. */
export interface VaultLeg {
  /** The vault. */
  readonly vaultId: string;
  /** The batcher the leg joins: the vault's active one, resolved when the join was prepared. */
  readonly batcher: Address;
  /** What the leg spends: the asset for a deposit, the vault's share token for a redeem. */
  readonly token: Address;
  /** The chosen vault's amount, zero for every other leg. */
  readonly amount: bigint;
}

/** An ERC-7984 operator approval a join relies on. Present only when the account lacks it. */
export interface OperatorApprovalCall extends Call {
  /** Tells an operator approval from a join without decoding the calldata. */
  readonly role: "operatorApproval";
  /** The vault whose token the approval is on. */
  readonly vaultId: string;
  /** The token the approval is on. */
  readonly token: Address;
  /** The approved operator: the router. */
  readonly operator: Address;
  /** When the approval expires, in chain seconds. */
  readonly until: bigint;
}

/** A join call, tagged with the leg it funds. A router call is tagged with the chosen leg. */
export interface JoinCall extends Call {
  /** Tells a join from an operator approval without decoding the calldata. */
  readonly role: "join";
  /** The leg this call funds. */
  readonly leg: VaultLeg;
}

/** A call of a prepared join. */
export type VaultCall = OperatorApprovalCall | JoinCall;

/**
 * How a join reaches the batchers, derived from the group size and the wallet mode.
 *
 * - `"legs"`: one call per leg, straight to each batcher. A group of one always
 *   takes it. In a larger group the calls must land together.
 * - `"router"`: one call through the router, after any operator approvals it needs.
 */
export type JoinRoute = "legs" | "router";

/**
 * How the sender's wallet lands several calls.
 *
 * - `"sequential"`: one at a time. A multi-vault join goes through the router.
 * - `"bundle"`: together or not at all (EIP-5792, a Safe, a smart account). A
 *   multi-vault join sends one transfer per vault, which needs no operator approval.
 */
export type WalletMode = "sequential" | "bundle";

/** A join built but not sent. Plain data: it survives `structuredClone`, but its bigints need a JSON replacer. */
export interface PreparedJoin {
  /** Whether it deposits or redeems. */
  readonly kind: Direction;
  /** The chain to send the calls on. */
  readonly chainId: number;
  /** The group joined. */
  readonly groupId: string;
  /** The vault that receives the amount. */
  readonly vaultId: string;
  /** The account the calls come from. */
  readonly account: Address;
  /** The amount, in the asset for a deposit and in shares for a redeem. */
  readonly amount: bigint;
  /** How the calls reach the batchers. */
  readonly route: JoinRoute;
  /** Every vault of the group, in group order, decoys included. */
  readonly legs: readonly [VaultLeg, ...VaultLeg[]];
  /** The operator approvals the account lacks, in leg order. Send them before the joins. */
  readonly operatorApprovals: readonly OperatorApprovalCall[];
  /**
   * The join calls. With `route: "legs"` in a group of more than one, send
   * them as one atomic bundle.
   */
  readonly joins: readonly [JoinCall, ...JoinCall[]];
  /** `operatorApprovals`, then `joins`: every call in send order, for a host that sends them all at once. */
  readonly calls: readonly [VaultCall, ...VaultCall[]];
}

/** What `prepareDeposit` and `prepareRedeem` take. */
export interface JoinInput<TVaultId extends string = string> {
  /** The vault the amount goes to. */
  readonly vaultId: TVaultId;
  /** The account the calls come from. */
  readonly account: Address;
  /** Plaintext; encrypted before it leaves the SDK. For a redeem, in shares. */
  readonly amount: bigint;
}

/**
 * Optional checks of a join. `"balance"` decrypts the account's balance as
 * the signer. A paused batcher is always checked.
 */
export type VaultCheck = "balance";

/** Options for `prepareDeposit` and `prepareRedeem`. */
export interface JoinOptions {
  /** Defaults to `"sequential"`. */
  readonly walletMode?: WalletMode;
  /**
   * Checks to run before encrypting. None by default, so preparing needs no
   * signer. `"balance"` decrypts as the signer, so it works only when
   * `account` is the signer's.
   */
  readonly checks?: readonly VaultCheck[];
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

/** A batcher on one chain, for `dispatch`, which acts on the batcher's open batch. */
export type BatcherRef = Pick<BatchRef, "chainId" | "batcher">;

/** What `client.deposit` and `client.redeem` take: a join input sent from the signer's account. */
export type SendJoinInput<TVaultId extends string = string> = Omit<JoinInput<TVaultId>, "account">;

/** A join input for `target`: a group needs `vaultId`, a single vault does not. */
export type JoinInputFor<TTarget extends VaultTarget> = TTarget extends VaultGroup
  ? JoinInput<VaultIdOf<TTarget>>
  : Omit<JoinInput<VaultIdOf<TTarget>>, "vaultId"> & { readonly vaultId?: VaultIdOf<TTarget> };

/** A send-join input for `target`: {@link JoinInputFor}, from the signer's account. */
export type SendJoinInputFor<TTarget extends VaultTarget> = Omit<JoinInputFor<TTarget>, "account">;

/** Options for `client.deposit` and `client.redeem`. */
export interface SendJoinOptions {
  /** Checks to skip. The balance check runs by default: the signer sends, so it can decrypt. */
  readonly skipChecks?: readonly VaultCheck[];
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

/** The batcher a join reaches right now on each vault, keyed by vault id. */
export type ActiveBatchers = Readonly<Record<string, Address>>;

/** What can be sent for a batch now. */
export type BatchAction = "claim" | "quit" | "dispatch" | "finalize";

interface BatchBase extends BatchRef {
  /** When the batch opened. */
  readonly createdAt: bigint;
  /** When anyone may dispatch it, pinned when it opened. */
  readonly dispatchableAt: bigint;
  /** Whether the batcher is paused. A paused batcher takes no join and no dispatch. */
  readonly paused: boolean;
  /** `account`'s encrypted deposit in the batch, when the read named an account. A claim or quit leaves an encrypted zero. */
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

/** What `client.deposit` and `client.redeem` return. */
export interface JoinOutcome {
  /** What was sent. */
  readonly prepared: PreparedJoin;
  /** The batch each leg landed in, in group order. */
  readonly batches: readonly (BatchRef & { readonly vaultId: string })[];
  /** Every transaction sent, operator approvals first. */
  readonly txHashes: readonly Hex[];
}
