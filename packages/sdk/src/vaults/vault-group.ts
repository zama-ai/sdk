import { getAddress, type Address, type Hex } from "viem";
import {
  confidentialTransferAndCallContract,
  isConfidentialTokenValidContract,
} from "../contracts";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  UnlistedConfidentialTokenError,
  VaultBatcherPausedError,
  VaultGroupJoinUnconfirmedError,
} from "../errors";
import type { EncryptedValue } from "../relayer/types";
import { withOperation, type TelemetryOperation } from "../telemetry";
import { Token, WrappedToken } from "../token";
import type { GenericSigner, TransactionResult, WriteContractConfig } from "../types";
import type { RawLog } from "../types/transaction";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { memoizeAddressRead } from "../utils/memoize-address-read";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import {
  encodeAllocationData,
  routerJoinContract,
  tokenWrapperRegistryContract,
  type EncryptedAllocationLeg,
} from "./contracts";
import { takeJoined } from "./events";
import type { JoinOptions, VaultAddresses } from "./types";
import { Vault } from "./vault";
import type { VaultBatcher } from "./vault-batcher";

type Direction = "deposit" | "redeem";

/** The most vaults a group may name: the router's per-transaction leg limit on the pull path, so a group is always exitable. */
export const MAX_GROUP_VAULTS = 10;

/** How long a grant `redeem` makes lasts when the caller gives no `operatorUntil`. */
const OPERATOR_WINDOW_SECONDS = 3600;

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

interface GroupLeg {
  readonly member: VaultGroupMember;
  readonly batcher: VaultBatcher;
  /** What this leg spends. */
  readonly token: WrappedToken;
  readonly amount: bigint;
}

const SIDES = {
  deposit: {
    batcher: (vault: Vault) => vault.depositBatcher,
    // The batcher's asset side: what a deposit batcher pulls, what a redeem batcher pays out.
    asset: (vault: Vault) => vault.depositBatcher.fromToken(),
  },
  redeem: {
    batcher: (vault: Vault) => vault.redeemBatcher,
    asset: (vault: Vault) => vault.redeemBatcher.toToken(),
  },
} as const;

const TELEMETRY = {
  deposit: "vault-group-deposit",
  redeem: "vault-group-redeem",
} as const satisfies Record<Direction, TelemetryOperation>;

// Deduped: every deposit leg spends the same `cAsset`.
function uniqueTokens(legs: readonly GroupLeg[]): WrappedToken[] {
  return [...new Map(legs.map((leg) => [leg.token.address, leg.token])).values()];
}

function duplicate<T>(values: readonly T[]): T | undefined {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

/**
 * The operator grants a redemption of `config` with `delivery` relies on,
 * from the config alone: the router on every member's `cShare` for
 * `"router"`, none for `"legs"` or a group of one. The same answer as
 * {@link VaultGroup.redeemOperators}, for the parts of a host's transaction
 * pipeline that run with the config in hand but no SDK instance in scope,
 * such as the guard that decides whether a grant transaction is needed.
 *
 * @throws if `delivery` is `"router"` and a member gives no `cShare`, or the config names no router. {@link ConfigurationError}
 */
export function vaultGroupRedeemOperators(
  config: VaultGroupConfig,
  delivery: JoinDelivery = "router",
): readonly VaultGroupOperator[] {
  if (config.vaults.length === 1 || delivery === "legs") {
    return [];
  }
  if (config.router === undefined) {
    throw new ConfigurationError(
      `Vault group "${config.id}" names no router, which a router submission needs`,
    );
  }
  const router = getAddress(config.router);
  return config.vaults.map((member) => {
    if (member.cShare === undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives no cShare for "${member.id}", which redeemOperators needs; pass it, or use prepareRedeem`,
      );
    }
    return { token: getAddress(member.cShare), spender: router };
  });
}

/**
 * Pair each leg of a submission with its `Joined` log in `logs`: what
 * {@link PreparedVaultGroupJoin.decodeJoins} does, from plain data, so a host
 * that saved the legs and the account can decode after a reload. A leg with
 * no log is reported in `unconfirmed` rather than thrown, so the host decides
 * what a partial match means for its delivery; for a partly sent `"legs"`
 * delivery, those are the legs still to send.
 *
 * @param prepared - The submission's `legs` and `account`.
 * @param logs - Every mined receipt's logs. For a `"legs"` delivery, pass the
 *   receipts in leg order: when the adapter omits log addresses, legs pair
 *   with logs by position.
 */
export function decodeVaultGroupJoins(
  prepared: Pick<PreparedVaultGroupJoin, "legs" | "account">,
  logs: readonly RawLog[],
): DecodedVaultGroupJoins {
  // Each log is consumed once, so the Nth match is the Nth leg's even when
  // the adapter omits log addresses.
  const remaining = [...logs];
  const joins: VaultGroupJoin[] = [];
  const unconfirmed: string[] = [];
  for (const leg of prepared.legs) {
    const joined = takeJoined(remaining, leg.batcher, prepared.account);
    if (!joined) {
      unconfirmed.push(leg.vaultId);
      continue;
    }
    joins.push({
      vaultId: leg.vaultId,
      batcher: leg.batcher,
      token: leg.token,
      batchId: joined.batchId,
      confidentialJoinedAmount: joined.confidentialAmount,
    });
  }
  return { joins, unconfirmed };
}

function toLeg(leg: GroupLeg): VaultGroupLeg {
  return {
    vaultId: leg.member.id,
    batcher: leg.batcher.address,
    token: leg.token.address,
    amount: leg.amount,
  };
}

/**
 * Vaults that take deposits in the same confidential asset, joined together: a
 * deposit into one member joins *every* member's batch, the chosen vault with
 * the amount and the rest with an encrypted zero.
 *
 * `deposit` and `redeem` sign and send one transaction through the SDK's
 * signer: through the router, or straight to the batcher for a group of one.
 * `prepareDeposit` and `prepareRedeem` stop short of sending, for a host with
 * its own transaction pipeline, and can also prepare one transfer per member.
 */
export class VaultGroup {
  /** The SDK the group reads and writes through. */
  readonly sdk: ZamaSDK;
  /** The configured group id, used in error messages. */
  readonly id: string;
  /** The shared asset wrapper, checksummed. */
  readonly cAsset: Address;
  /** The router a `"router"` submission goes through, checksummed; `undefined` when the config names none. */
  readonly router: Address | undefined;
  /** The members in leg order. */
  readonly members: readonly VaultGroupMember[];

  readonly #config: VaultGroupConfig;
  readonly #shares: ReadonlyMap<string, Address>;
  readonly #registry: () => Promise<Address>;

  constructor(sdk: ZamaSDK, config: VaultGroupConfig) {
    if (config.vaults.length === 0) {
      throw new ConfigurationError(`Vault group "${config.id}" names no vault`);
    }
    if (config.vaults.length > MAX_GROUP_VAULTS) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults, above the ${MAX_GROUP_VAULTS} a submission can carry`,
      );
    }
    const members = config.vaults.map((member) => ({
      id: member.id,
      vault: new Vault(sdk, member),
    }));
    const duplicateId = duplicate(members.map((member) => member.id));
    if (duplicateId !== undefined) {
      throw new ConfigurationError(`Vault group "${config.id}" names "${duplicateId}" twice`);
    }
    const duplicateVault = duplicate(
      config.vaults.flatMap((member) => (member.vault ? [getAddress(member.vault)] : [])),
    );
    if (duplicateVault !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateVault} as the vault of more than one member`,
      );
    }
    // A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
    const duplicateBatcher = duplicate(
      members.flatMap(({ vault }) => [vault.depositBatcher.address, vault.redeemBatcher.address]),
    );
    if (duplicateBatcher !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names batcher ${duplicateBatcher} more than once`,
      );
    }
    const duplicateShare = duplicate(
      config.vaults.flatMap((member) => (member.cShare ? [getAddress(member.cShare)] : [])),
    );
    if (duplicateShare !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateShare} as the share token of more than one member`,
      );
    }

    this.sdk = sdk;
    this.#config = config;
    this.id = config.id;
    this.cAsset = getAddress(config.cAsset);
    this.router = config.router ? getAddress(config.router) : undefined;
    this.members = members;
    this.#shares = new Map(
      config.vaults.flatMap((member) =>
        member.cShare ? [[member.id, getAddress(member.cShare)] as const] : [],
      ),
    );
    // The router declares its registry `immutable`, so one read holds for the group's lifetime.
    this.#registry = memoizeAddressRead(async () =>
      getAddress(await sdk.provider.readContract(tokenWrapperRegistryContract(this.#router()))),
    );
  }

  /** Whether the router's registry lists `cAsset`, which a router deposit requires. Not cached: a listing can be revoked. */
  async isAssetListed(): Promise<boolean> {
    return this.sdk.provider.readContract(
      isConfidentialTokenValidContract(await this.#registry(), this.cAsset),
    );
  }

  /**
   * One member by id.
   *
   * @throws if no member has id `vaultId`. {@link ConfigurationError}
   */
  member(vaultId: string): VaultGroupMember {
    const member = this.members.find((candidate) => candidate.id === vaultId);
    if (!member) {
      throw new ConfigurationError(`Vault group "${this.id}" has no vault "${vaultId}"`);
    }
    return member;
  }

  /**
   * The operator grants a redemption with `delivery` relies on, from the
   * config alone: the router on every member's share token for `"router"`,
   * none for `"legs"` or a group of one. Lets a host check the grants before
   * it prepares anything.
   *
   * @throws if `delivery` is `"router"` and a member's config gives no `cShare`, or the config names no router. {@link ConfigurationError}
   */
  redeemOperators(delivery: JoinDelivery = "router"): readonly VaultGroupOperator[] {
    return vaultGroupRedeemOperators(this.#config, delivery);
  }

  /**
   * The grants in a prepared redemption's `requiredOperators` that its
   * account does not hold: the ones the host makes before sending the
   * writes, and the ones `redeem` makes itself. `isOperator` answers for the
   * current block, so make each grant with an `until` that outlasts the time
   * the writes take to land.
   */
  async missingOperators(
    prepared: Pick<PreparedVaultGroupJoin, "account" | "requiredOperators">,
  ): Promise<readonly VaultGroupOperator[]> {
    const granted = await Promise.all(
      prepared.requiredOperators.map((operator) =>
        new Token(this.sdk, operator.token).isOperator(prepared.account, operator.spender),
      ),
    );
    return prepared.requiredOperators.filter((_operator, index) => !granted[index]);
  }

  /**
   * Build a deposit without sending it: every verification `deposit` does,
   * the encryptions, and the writes, for a host that signs and sends through
   * its own pipeline.
   *
   * @param vaultId - The member to deposit into.
   * @param amount - The plaintext amount; encrypted before submission.
   * @param options - The account, delivery, and which checks to skip.
   *
   * @throws if no member has id `vaultId`, a `"router"` delivery has no router, or the balance check would run for an `account` that is not the signer's. {@link ConfigurationError}
   * @throws unless `skipPreflight`, if a member's batchers disagree with its config or are not paired with `cAsset`, or two members' batchers report the same vault. {@link ConfigurationError}
   * @throws if a member's deposit batcher is paused. {@link VaultBatcherPausedError}
   * @throws unless `skipPreflight`, if a router deposit's `cAsset` is not listed in the router's registry. {@link UnlistedConfidentialTokenError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   */
  async prepareDeposit(
    vaultId: string,
    amount: bigint,
    options?: PrepareVaultGroupJoinOptions,
  ): Promise<PreparedVaultGroupJoin> {
    return this.#prepare("deposit", vaultId, amount, options);
  }

  /**
   * Build a redemption without sending it. The writes rely on the grants in
   * `requiredOperators`; the host makes the ones {@link missingOperators}
   * returns first.
   *
   * @param vaultId - The member to redeem from.
   * @param amount - The plaintext amount of shares: ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   * @param options - The account, delivery, and which checks to skip.
   *
   * @throws if no member has id `vaultId`, a `"router"` delivery has no router, or the balance check would run for an `account` that is not the signer's. {@link ConfigurationError}
   * @throws unless `skipPreflight`, if a member's batchers disagree with its config or are not paired with `cAsset`, or two members' batchers report the same vault. {@link ConfigurationError}
   * @throws if a member's redeem batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   */
  async prepareRedeem(
    vaultId: string,
    amount: bigint,
    options?: PrepareVaultGroupJoinOptions,
  ): Promise<PreparedVaultGroupJoin> {
    return this.#prepare("redeem", vaultId, amount, options);
  }

  /**
   * Deposit the confidential asset into one member of the group, joining every
   * member's current deposit batch in one transaction.
   *
   * @param vaultId - The member to deposit into.
   * @param amount - The plaintext amount; encrypted before submission.
   *
   * @remarks
   * There is no `beneficiary`: the router credits the account the legs came
   * from, so a group deposit cannot be made on someone else's behalf.
   *
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if no member has id `vaultId`, a member's batchers disagree with its config or are not paired with `cAsset`, two members' batchers report the same vault, or a group of more than one member names no router. {@link ConfigurationError}
   * @throws if a member's deposit batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the router's registry does not list `cAsset`. {@link UnlistedConfidentialTokenError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   * @throws if a `Joined` event in the mined receipt could not be matched to every leg. {@link VaultGroupJoinUnconfirmedError}
   */
  async deposit(
    vaultId: string,
    amount: bigint,
    options?: JoinOptions,
  ): Promise<VaultGroupJoinResult> {
    const signer = this.#requireSigner("deposit");
    const prepared = await this.prepareDeposit(vaultId, amount, {
      skipBalanceCheck: options?.skipBalanceCheck,
      operation: options?.operation,
    });
    return this.#send(signer, prepared);
  }

  /**
   * Redeem shares of one member of the group by joining every member's
   * current redeem batch in one transaction, each leg with its own share token.
   *
   * @param vaultId - The member to redeem from.
   * @param amount - The plaintext amount of shares: ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   *
   * @remarks
   * In a group of more than one, the router pulls every leg's share token, so
   * before the join this grants it an operator approval on each member's share
   * token that lacks one. Each grant is its own wallet prompt, so a first
   * redemption from a group of N vaults can ask the user to sign up to N + 1
   * times. The balance check decrypts every member's share balance, not only
   * the chosen one's.
   *
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if no member has id `vaultId`, a member's batchers disagree with its config or are not paired with `cAsset`, two members' batchers report the same vault, or a group of more than one member names no router. {@link ConfigurationError}
   * @throws if a member's redeem batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   * @throws if a `Joined` event in the mined receipt could not be matched to every leg. {@link VaultGroupJoinUnconfirmedError}
   */
  async redeem(
    vaultId: string,
    amount: bigint,
    options?: VaultGroupRedeemOptions,
  ): Promise<VaultGroupJoinResult> {
    const signer = this.#requireSigner("redeem");
    const prepared = await this.prepareRedeem(vaultId, amount, {
      skipBalanceCheck: options?.skipBalanceCheck,
      operation: options?.operation,
    });
    // Encrypted before the grants, which cost the user a signature each; a proof does not expire.
    const missing = await this.missingOperators(prepared);
    if (missing.length > 0) {
      // The token compares the deadline against the block's time, not the local clock.
      const until =
        options?.operatorUntil ??
        Number(await this.sdk.provider.getBlockTimestamp()) + OPERATOR_WINDOW_SECONDS;
      for (const operator of missing) {
        await new Token(this.sdk, operator.token).setOperator(operator.spender, until);
      }
    }
    return this.#send(signer, prepared);
  }

  // INTERNAL

  #requireSigner(direction: Direction): GenericSigner {
    const signer = this.sdk.signer;
    if (!signer) {
      throw new SignerNotConfiguredError(direction);
    }
    return signer;
  }

  #router(): Address {
    if (this.router === undefined) {
      throw new ConfigurationError(
        `Vault group "${this.id}" names no router, which a router submission needs`,
      );
    }
    return this.router;
  }

  // A group of one has nothing to hide a leg among, so it joins its batcher directly.
  #delivery(requested: JoinDelivery | undefined): JoinDelivery {
    return this.members.length === 1 ? "legs" : (requested ?? "router");
  }

  async #prepare(
    direction: Direction,
    vaultId: string,
    amount: bigint,
    options: PrepareVaultGroupJoinOptions | undefined,
  ): Promise<PreparedVaultGroupJoin> {
    const { operation } = withOperation(options, TELEMETRY[direction]);
    const member = this.member(vaultId);
    const delivery = this.#delivery(options?.delivery);
    const router = delivery === "router" ? this.#router() : undefined;
    const account = await this.#account(direction, options);

    // Read alongside the legs, so an unlisted asset, or a router with no registry to read, fails
    // before the balance check can prompt the wallet.
    const [legs] = await Promise.all([
      options?.skipPreflight
        ? this.#configuredLegs(direction, member, amount)
        : this.#verifiedLegs(direction, member, amount),
      router === undefined || options?.skipPreflight
        ? undefined
        : direction === "deposit"
          ? this.#requireAssetListed()
          : this.#registry(),
    ]);
    if (!options?.skipBalanceCheck) {
      await this.#assertBalance(direction, member, amount, legs, account);
    }

    const writes =
      router === undefined
        ? await this.#legWrites(direction, legs, account, operation)
        : await this.#routerWrite(direction, router, member, legs, account, operation);

    const publicLegs = legs.map(toLeg);
    return {
      direction,
      vaultId,
      account,
      delivery,
      legs: publicLegs,
      writes,
      requiredOperators:
        direction === "redeem" && router !== undefined
          ? uniqueTokens(legs).map((token) => ({ token: token.address, spender: router }))
          : [],
      decodeJoins: (logs) => decodeVaultGroupJoins({ legs: publicLegs, account }, logs),
    };
  }

  async #account(
    direction: Direction,
    options: PrepareVaultGroupJoinOptions | undefined,
  ): Promise<Address> {
    const requested = options?.account === undefined ? undefined : getAddress(options.account);
    if (requested !== undefined && options?.skipBalanceCheck) {
      return requested;
    }
    // The balance check decrypts as the signer, so it can only vouch for the signer's account.
    if (requested !== undefined && this.sdk.signer === undefined) {
      throw new ConfigurationError(
        `The balance check for ${requested} decrypts as the signer, and none is configured; pass skipBalanceCheck to prepare without one`,
      );
    }
    const wallet = getAddress(
      (await requireAlignedWalletAccount(direction, this.sdk.signer, this.sdk.provider)).address,
    );
    if (requested !== undefined && requested !== wallet) {
      throw new ConfigurationError(
        `The balance check for ${requested} decrypts as the signer's account ${wallet}; pass skipBalanceCheck to prepare for another account`,
      );
    }
    return wallet;
  }

  // Every member gets a leg, zero-amount ones included: trimming them would reveal which vault was chosen.
  #amountFor(member: VaultGroupMember, chosen: VaultGroupMember, amount: bigint): bigint {
    return member === chosen ? amount : 0n;
  }

  // What the config says each leg joins and spends. Only `paused()` and a missing share token are read.
  async #configuredLegs(
    direction: Direction,
    chosen: VaultGroupMember,
    amount: bigint,
  ): Promise<readonly GroupLeg[]> {
    return Promise.all(
      this.members.map(async (member) => {
        const batcher = SIDES[direction].batcher(member.vault);
        const [token, paused] = await Promise.all([
          direction === "deposit" ? new WrappedToken(this.sdk, this.cAsset) : this.#share(member),
          batcher.paused(),
        ]);
        this.#assertNotPaused(member, batcher, paused);
        return { member, batcher, token, amount: this.#amountFor(member, chosen, amount) };
      }),
    );
  }

  // One paused batcher reverts the whole submission, so every leg's is checked, not just the chosen one's.
  #assertNotPaused(member: VaultGroupMember, batcher: VaultBatcher, paused: boolean): void {
    if (paused) {
      throw new VaultBatcherPausedError(
        `Batcher ${batcher.address} of vault "${member.id}" in group "${this.id}" is paused, so no member can be joined until it resumes`,
        { batcher: batcher.address, vaultId: member.id },
      );
    }
  }

  async #share(member: VaultGroupMember): Promise<WrappedToken> {
    const configured = this.#shares.get(member.id);
    return configured === undefined
      ? member.vault.cShare()
      : new WrappedToken(this.sdk, configured);
  }

  async #verifiedLegs(
    direction: Direction,
    chosen: VaultGroupMember,
    amount: bigint,
  ): Promise<readonly GroupLeg[]> {
    const legs = await Promise.all(
      this.members.map((member) =>
        this.#verifiedLeg(direction, member, this.#amountFor(member, chosen, amount)),
      ),
    );
    // The constructor's check only sees configured addresses; the batchers' reports can still name one vault twice.
    const duplicateVault = duplicate(legs.map((leg) => leg.vault));
    if (duplicateVault !== undefined) {
      throw new ConfigurationError(
        `Vault group "${this.id}" has two members whose batchers report the same vault ${duplicateVault}`,
      );
    }
    return legs;
  }

  async #verifiedLeg(
    direction: Direction,
    member: VaultGroupMember,
    amount: bigint,
  ): Promise<GroupLeg & { readonly vault: Address }> {
    const side = SIDES[direction];
    const batcher = side.batcher(member.vault);
    const [vault, share, asset, paused] = await Promise.all([
      member.vault.vaultAddress(),
      member.vault.cShare(),
      side.asset(member.vault),
      batcher.paused(),
    ]);
    if (getAddress(asset) !== this.cAsset) {
      throw new ConfigurationError(
        `Batcher ${batcher.address} of vault "${member.id}" is paired with ${asset}, but group "${this.id}" is configured with ${this.cAsset}`,
      );
    }
    const configuredShare = this.#shares.get(member.id);
    if (configuredShare !== undefined && configuredShare !== share.address) {
      throw new ConfigurationError(
        `Vault "${member.id}" of group "${this.id}" is configured with share token ${configuredShare}, but its redeem batcher pulls ${share.address}`,
      );
    }
    this.#assertNotPaused(member, batcher, paused);
    return {
      member,
      batcher,
      token: direction === "deposit" ? new WrappedToken(this.sdk, this.cAsset) : share,
      vault,
      amount,
    };
  }

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: Direction,
    member: VaultGroupMember,
    amount: bigint,
    legs: readonly GroupLeg[],
    account: Address,
  ): Promise<void> {
    const token = legs.find((leg) => leg.member === member)?.token;
    if (token === undefined) {
      throw new ConfigurationError(`Vault group "${this.id}" built no leg for "${member.id}"`);
    }
    await assertConfidentialBalance({
      operation: direction,
      tokenAddress: token.address,
      amount,
      account,
      signer: this.sdk.signer,
      provider: this.sdk.provider,
      // Every leg's token is decrypted, not just the chosen one's: a lone decrypt would tell the relayer which vault was picked.
      readBalance: async (owner) => {
        const { results, errors } = await Token.batchBalancesOf(uniqueTokens(legs), owner);
        const balance = results.get(token.address);
        if (balance === undefined) {
          throw (
            errors.get(token.address) ??
            new BalanceCheckUnavailableError(`Balance validation failed (token: ${token.address})`)
          );
        }
        return balance;
      },
    });
  }

  async #encrypt(
    contractAddress: Address,
    account: Address,
    values: readonly bigint[],
    operation: TelemetryOperation,
  ): Promise<{ readonly encryptedValues: readonly EncryptedValue[]; readonly inputProof: Hex }> {
    const { encryptedValues, inputProof } = await this.sdk.encrypt(
      {
        values: values.map((value) => ({ value, type: "euint64" as const })),
        contractAddress,
        userAddress: account,
      },
      { operation },
    );
    if (encryptedValues.length !== values.length) {
      throw new EncryptionFailedError(
        `Encryption returned ${encryptedValues.length} values for ${values.length} legs`,
      );
    }
    return { encryptedValues, inputProof };
  }

  // One transfer per leg, each verified by the token it spends: one proof covers a deposit's
  // legs, which all spend `cAsset`; a redemption's legs each spend their own share token.
  async #legWrites(
    direction: Direction,
    legs: readonly GroupLeg[],
    account: Address,
    operation: TelemetryOperation,
  ): Promise<readonly PreparedVaultGroupWrite[]> {
    const write = (leg: GroupLeg, encryptedAmount: EncryptedValue, inputProof: Hex) => ({
      leg: toLeg(leg),
      call: confidentialTransferAndCallContract(
        leg.token.address,
        leg.batcher.address,
        encryptedAmount,
        inputProof,
        "0x",
      ),
    });
    if (direction === "deposit") {
      const { encryptedValues, inputProof } = await this.#encrypt(
        this.cAsset,
        account,
        legs.map((leg) => leg.amount),
        operation,
      );
      return legs.map((leg, index) =>
        write(leg, encryptedValues[index] as EncryptedValue, inputProof),
      );
    }
    return Promise.all(
      legs.map(async (leg) => {
        const { encryptedValues, inputProof } = await this.#encrypt(
          leg.token.address,
          account,
          [leg.amount],
          operation,
        );
        return write(leg, encryptedValues[0] as EncryptedValue, inputProof);
      }),
    );
  }

  // Bound to the router rather than the batchers or the tokens: the router is the contract that verifies the proof.
  async #routerWrite(
    direction: Direction,
    router: Address,
    chosen: VaultGroupMember,
    legs: readonly GroupLeg[],
    account: Address,
    operation: TelemetryOperation,
  ): Promise<readonly PreparedVaultGroupWrite[]> {
    const chosenLeg = legs.find((leg) => leg.member === chosen);
    if (chosenLeg === undefined) {
      throw new ConfigurationError(`Vault group "${this.id}" built no leg for "${chosen.id}"`);
    }
    const allocation = async (): Promise<{ legs: EncryptedAllocationLeg[]; inputProof: Hex }> => {
      const { encryptedValues, inputProof } = await this.#encrypt(
        router,
        account,
        legs.map((leg) => leg.amount),
        operation,
      );
      return {
        legs: legs.map((leg, index) => ({
          batcher: leg.batcher.address,
          token: leg.token.address,
          amount: encryptedValues[index] as EncryptedValue,
        })),
        inputProof,
      };
    };
    if (direction === "redeem") {
      const { legs: encryptedLegs, inputProof } = await allocation();
      return [
        { leg: toLeg(chosenLeg), call: routerJoinContract(router, encryptedLegs, inputProof) },
      ];
    }
    // One encryption per verifying contract: the asset checks the transfer's proof, the router the allocation's.
    const total = legs.reduce((sum, leg) => sum + leg.amount, 0n);
    const [transfer, encryptedAllocation] = await Promise.all([
      this.#encrypt(this.cAsset, account, [total], operation),
      allocation(),
    ]);
    return [
      {
        leg: toLeg(chosenLeg),
        call: confidentialTransferAndCallContract(
          this.cAsset,
          router,
          transfer.encryptedValues[0] as EncryptedValue,
          transfer.inputProof,
          encodeAllocationData(encryptedAllocation.legs, encryptedAllocation.inputProof),
        ),
      },
    ];
  }

  // The router rejects a push of an unlisted token with a revert that costs the caller a transaction.
  async #requireAssetListed(): Promise<void> {
    if (!(await this.isAssetListed())) {
      throw new UnlistedConfidentialTokenError(
        `The vault router's registry does not list ${this.cAsset}, so it would reject a transfer of it`,
        { token: this.cAsset, registry: await this.#registry() },
      );
    }
  }

  // A router delivery, or a group of one's lone leg: one write either way. Several legs are only
  // private as an atomic bundle, which a host sends itself.
  async #send(
    signer: GenericSigner,
    prepared: PreparedVaultGroupJoin,
  ): Promise<VaultGroupJoinResult> {
    const [write, ...extra] = prepared.writes;
    if (write === undefined || extra.length > 0) {
      throw new ConfigurationError(
        `Vault group "${this.id}" prepared ${prepared.writes.length} writes for one submission`,
      );
    }
    const transaction = await submitSdkTransaction({
      operation: prepared.delivery === "router" ? "vault:routerJoin" : "vault:join",
      signer,
      provider: this.sdk.provider,
      config: write.call,
      emit: (input) =>
        this.sdk.emitEvent(
          input,
          prepared.delivery === "router" ? this.#router() : write.leg.batcher,
        ),
      logger: this.sdk.logger,
    });
    const { joins, unconfirmed } = prepared.decodeJoins(transaction.receipt.logs);
    if (unconfirmed.length > 0) {
      throw new VaultGroupJoinUnconfirmedError(
        `Transaction ${transaction.txHash} was mined, but its receipt has no Joined event for ${prepared.account} from the batcher of vault(s) ${unconfirmed.map((id) => `"${id}"`).join(", ")} in group "${this.id}"`,
        { txHash: transaction.txHash, receipt: transaction.receipt, joins, unconfirmed },
      );
    }
    return { ...transaction, vaultId: prepared.vaultId, joins };
  }
}

/**
 * Create a {@link VaultGroup} bound to `sdk`.
 *
 * @example
 * ```ts
 * import { createVaultGroup } from "@zama-fhe/sdk/vaults";
 *
 * const group = createVaultGroup(sdk, {
 *   id: "stable",
 *   cAsset: "0xConfidentialAsset",
 *   router: "0xRouter",
 *   vaults: [
 *     { id: "alpha", depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
 *     { id: "beta", depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
 *   ],
 * });
 * const { joins } = await group.deposit("alpha", 1_000_000n);
 * ```
 */
export function createVaultGroup(sdk: ZamaSDK, config: VaultGroupConfig): VaultGroup {
  return new VaultGroup(sdk, config);
}
