import type { Address } from "viem";
import type { EncryptedValue } from "../relayer/types";
import type { TransactionResult, WriteContractConfig } from "../types";
import type { RawLog } from "../types/transaction";
import type { JoinOptions, VaultAddresses } from "./types";
import type { Vault } from "./vault";

/** Whether a submission joins deposit or redeem batchers. */
export type Direction = "deposit" | "redeem";

/** One vault of a group. */
export interface VaultMemberConfig extends VaultAddresses {
  /** What callers pass to `deposit` and `redeem` to pick this vault. */
  readonly id: string;
  /**
   * The vault's confidential share token. Optional: read from the redeem
   * batcher when absent, and checked against it when given.
   */
  readonly cShare?: Address;
}

/** What {@link createVaultGroup} takes. */
export interface VaultGroupConfig {
  /** Names the group in error messages. */
  readonly id: string;
  /** The confidential wrapper of the asset every member takes deposits in. */
  readonly cAsset: Address;
  /**
   * The router that fans a submission out across the members. Optional for a
   * group of one, which joins its only batcher directly, and for a host that
   * only ever prepares `"legs"` deliveries.
   */
  readonly router?: Address;
  /** The members, in the order their legs are submitted. */
  readonly vaults: readonly VaultMemberConfig[];
}

/** A member of a {@link VaultGroup}. */
export interface VaultGroupMember {
  /** What callers pass to `deposit` and `redeem` to pick this vault. */
  readonly id: string;
  /** The vault, whose batchers are where claims and quits happen. */
  readonly vault: Vault;
}

/** Options for {@link VaultGroup.redeem}; a deposit takes plain {@link JoinOptions}. */
export interface VaultGroupRedeemOptions extends JoinOptions {
  /**
   * Unix timestamp until which the router's operator grant on each share
   * token is valid, for a grant this redemption has to make. Defaults to the
   * chain's current time + 1 hour.
   */
  operatorUntil?: number;
}

/**
 * How a group submission reaches the batchers.
 *
 * - `"router"`: one transaction through the router, which joins every leg.
 * - `"legs"`: one transfer per member, each straight to its batcher. Only
 *   private when the wallet lands them atomically, as an EIP-5792 bundle
 *   does; sent one by one, a user who stops partway reveals the vaults the
 *   remaining legs would have named.
 */
export type JoinDelivery = "router" | "legs";

/** One member's leg of a submission. */
export interface VaultGroupLeg {
  /** The member this leg belongs to. */
  readonly vaultId: string;
  /** The batcher this leg joins. */
  readonly batcher: Address;
  /** The token this leg spends: `cAsset` for a deposit, the member's share token for a redemption. */
  readonly token: Address;
  /** The plaintext amount: the chosen member's `amount`, zero for every other member. */
  readonly amount: bigint;
}

/** One write of a prepared submission. */
export interface PreparedVaultGroupWrite {
  /** The leg this write funds. A router write carries the chosen member's. */
  readonly leg: VaultGroupLeg;
  /** The call, ready for the host's own signer, bundler or queue. */
  readonly call: WriteContractConfig;
}

/** An ERC-7984 operator grant a submission relies on. */
export interface VaultGroupOperator {
  /** The member whose share token the grant is on. */
  readonly vaultId: string;
  /** The share token the grant is on. */
  readonly token: Address;
  /** The router, which pulls the token. */
  readonly spender: Address;
}

/** A submission built but not sent: what {@link VaultGroup.prepareDeposit} and {@link VaultGroup.prepareRedeem} return. */
export interface PreparedVaultGroupJoin {
  /** Whether the legs join deposit or redeem batchers. */
  readonly direction: Direction;
  /** The member the caller chose; every other leg is a decoy. */
  readonly vaultId: string;
  /** The account the legs come from, which the batchers credit. */
  readonly account: Address;
  /** The delivery the writes take: the one asked for, or `"legs"` for a group of one. */
  readonly delivery: JoinDelivery;
  /** One leg per member, in group order. */
  readonly legs: readonly VaultGroupLeg[];
  /** The writes to send, in order: one through the router, or one per leg. */
  readonly writes: readonly PreparedVaultGroupWrite[];
  /**
   * The operator grants the writes rely on: the router on each share token
   * of a `"router"` redemption, otherwise none. The host grants the ones the
   * account lacks before sending the writes.
   */
  readonly requiredOperators: readonly VaultGroupOperator[];
  /** {@link decodeVaultGroupJoins} bound to this submission's legs and account. */
  decodeJoins(logs: readonly RawLog[]): DecodedVaultGroupJoins;
}

/** What {@link decodeVaultGroupJoins} found in a submission's logs. */
export interface DecodedVaultGroupJoins {
  /** One entry per leg whose `Joined` log was found, in leg order. */
  readonly joins: readonly VaultGroupJoin[];
  /** The ids of the members whose leg has no `Joined` log in the logs given. */
  readonly unconfirmed: readonly string[];
}

/** Options for {@link VaultGroup.prepareDeposit} and {@link VaultGroup.prepareRedeem}. */
export interface PrepareVaultGroupJoinOptions extends JoinOptions {
  /**
   * The account the legs come from. Defaults to the signer's wallet account,
   * so a host without a signer must pass it. The balance check decrypts as
   * the signer, so for any other account also pass `skipBalanceCheck`.
   */
  account?: Address;
  /** Defaults to `"router"`. A group of one always goes `"legs"`. */
  delivery?: JoinDelivery;
  /**
   * Skip the chain reads that verify the configuration (each member's
   * batchers against its config, the registry listing for a router deposit),
   * for a host that verified it itself. `paused()` is still read on every
   * batcher, since no configuration can vouch for it, and a member's share
   * token is still read when its config gives no `cShare`.
   */
  skipPreflight?: boolean;
}

/** What one leg's batcher reported. */
export interface VaultGroupJoin {
  /** The member this leg joined, by id. */
  vaultId: string;
  /** The batcher this leg joined, where its claim and quit happen. */
  batcher: Address;
  /** The token this leg spent: `cAsset` for a deposit, the member's share token for a redemption. */
  token: Address;
  /** The batch the leg landed in; what that batcher's `claim` and `quit` take. */
  batchId: bigint;
  /**
   * The encrypted amount credited. Zero for every leg but the chosen one, and
   * zero for that one too if `skipBalanceCheck` let a short balance through,
   * since an ERC-7984 transfer moves nothing rather than reverting.
   */
  confidentialJoinedAmount: EncryptedValue;
}

/** The transaction that joined every member, plus what each member's batcher reported. */
export interface VaultGroupJoinResult extends TransactionResult {
  /** The member the caller chose; every other leg is a decoy. */
  vaultId: string;
  /** One entry per leg, in group order, decoys included. */
  joins: readonly VaultGroupJoin[];
}
