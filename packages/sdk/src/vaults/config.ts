import { getAddress, isAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";
import type { JoinDirection } from "./types";

/** The most vaults a group may hold. */
export const MAX_GROUP_VAULTS = 4;

/**
 * A batcher, with the last batch it takes joins in. Set `lastBatchId` only for
 * a batcher whose contract has no `closed()`.
 */
export interface BatcherEntry {
  /** The batcher's address. */
  readonly address: Address;
  /** The last batch joins may land in. Past it, joins go to the vault's other batchers. */
  readonly lastBatchId?: bigint;
}

/** The batchers of one vault direction: an address, or a list of addresses and {@link BatcherEntry} objects. A join or read throws on an empty list. */
export type Batchers = Address | readonly (Address | BatcherEntry)[];

/**
 * A batcher that took joins while its `currentBatchId` was at most `lastBatchId`.
 *
 * @deprecated List the batchers as {@link Batchers} instead, a retired one as `{ address, lastBatchId }`.
 */
export type RetiredBatcher = BatcherEntry & { readonly lastBatchId: bigint };

/**
 * Every batcher a vault has had in one direction. Read as the list
 * `[...retired, latest]`, so `latest` takes joins as soon as it is open, even
 * before a retired batcher reaches its `lastBatchId`.
 *
 * @deprecated List the batchers as {@link Batchers} instead.
 */
export interface BatcherHistory {
  /** Oldest first. */
  readonly retired: readonly RetiredBatcher[];
  /** The newest batcher. */
  readonly latest: Address;
}

/** One vault: its chain and the batchers each direction joins. */
export interface Vault<TVaultId extends string = string> {
  /** Names the vault in errors and query keys, and is what a group join passes as `vaultId`. */
  readonly id: TVaultId;
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
  /**
   * The batchers each direction joins. A join reaches the open batch that is
   * dispatched next; paused and closed batchers take none.
   */
  readonly batchers: Readonly<Record<JoinDirection, Batchers | BatcherHistory>>;
}

/** Vaults that take deposits in one confidential asset, joined together. */
export interface VaultGroup<TGroupId extends string = string, TVaultId extends string = string> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /**
   * The vaults, in leg order, up to {@link MAX_GROUP_VAULTS}. They must be on one
   * chain, and their deposit batchers must take the same confidential asset.
   */
  readonly vaults: readonly [Vault<TVaultId>, Vault<TVaultId>, ...Vault<TVaultId>[]];
}

/** The vault ids of a group. */
export type VaultIdOf<TGroup extends VaultGroup> =
  TGroup extends VaultGroup<string, infer TVaultId> ? TVaultId : never;

/**
 * Define a vault, keeping its id as a literal type. Returns `vault` as is and
 * checks nothing.
 *
 * @example
 * ```ts
 * export const ALPHA = defineVault({
 *   id: "alpha",
 *   chainId: 1,
 *   batchers: { deposit: "0xAlphaDeposit", redeem: ["0xAlphaRedeemA", "0xAlphaRedeemB"] },
 * });
 * ```
 */
export function defineVault<const TVaultId extends string>(
  vault: Vault<TVaultId>,
): Vault<TVaultId> {
  return vault;
}

/**
 * Define a group of vaults, keeping its ids as literal types, so a typo in
 * `vaultId` is a type error. Returns `group` as is and checks nothing.
 *
 * @example
 * ```ts
 * const ALPHA = defineVault({
 *   id: "alpha",
 *   chainId: 1,
 *   batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
 * });
 * const BETA = defineVault({
 *   id: "beta",
 *   chainId: 1,
 *   batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
 * });
 * export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
 * ```
 */
export function defineVaultGroup<const TGroupId extends string, const TVaultId extends string>(
  group: VaultGroup<TGroupId, TVaultId>,
): VaultGroup<TGroupId, TVaultId> {
  return group;
}

/**
 * The chain a vault, or every vault of a group, is on.
 *
 * @internal
 */
export function chainIdOf(target: Vault | VaultGroup): number {
  return "vaults" in target ? target.vaults[0].chainId : target.chainId;
}

/**
 * What a join or a read of `target` covers: every vault of a group, or a
 * vault on its own and no group.
 *
 * @internal
 * @throws if a group has more than {@link MAX_GROUP_VAULTS} vaults, mixes chains, or names a vault twice. {@link ConfigurationError}
 */
export function scopeOf(target: Vault | VaultGroup): {
  readonly group: VaultGroup | undefined;
  readonly vaults: readonly [Vault, ...Vault[]];
  readonly chainId: number;
} {
  if (!("vaults" in target)) {
    return { group: undefined, vaults: [target], chainId: target.chainId };
  }
  const where = `Vault group "${target.id}"`;
  const [first] = target.vaults;
  if (target.vaults.length > MAX_GROUP_VAULTS) {
    throw new ConfigurationError(
      `${where} has ${target.vaults.length} vaults, more than ${MAX_GROUP_VAULTS}`,
    );
  }
  const vaultIds = new Set<string>();
  for (const vault of target.vaults) {
    if (vault.chainId !== first.chainId) {
      throw new ConfigurationError(
        `${where} mixes chains: vault "${vault.id}" is on chain ${vault.chainId}, vault "${first.id}" on chain ${first.chainId}`,
      );
    }
    if (vaultIds.has(vault.id)) {
      throw new ConfigurationError(`${where} names vault "${vault.id}" twice`);
    }
    vaultIds.add(vault.id);
  }
  return { group: target, vaults: target.vaults, chainId: first.chainId };
}

/**
 * Every batcher of `vault` in `direction`, checksummed, in declared order. A
 * history lists its retired batchers, then `latest`.
 *
 * @internal
 * @throws if no batcher is listed, or an address or a `lastBatchId` is invalid. {@link ConfigurationError}
 */
export function batchersOf(
  vault: Vault,
  direction: JoinDirection,
): readonly [BatcherEntry, ...BatcherEntry[]] {
  const where = `Vault "${vault.id}" ${direction} batcher`;
  const [first, ...rest] = listOf(vault.batchers[direction], where).map((batcher) =>
    entryOf(batcher, where),
  );
  if (first === undefined) {
    throw new ConfigurationError(`${where} list is empty`);
  }
  return [first, ...rest];
}

function listOf(
  declared: Batchers | BatcherHistory,
  where: string,
): readonly (Address | BatcherEntry)[] {
  if (typeof declared === "string") {
    return [declared];
  }
  if (isArray(declared)) {
    return declared;
  }
  if (!("latest" in declared)) {
    throw new ConfigurationError(`${where} must be an address or a list`);
  }
  // Without its lastBatchId, a retired batcher would read as live and keep taking joins.
  const unbounded = declared.retired.find((entry) => entry.lastBatchId === undefined);
  if (unbounded !== undefined) {
    throw new ConfigurationError(
      `${where} ${unbounded.address} has an invalid lastBatchId: undefined`,
    );
  }
  return [...declared.retired, declared.latest];
}

// `Array.isArray` does not narrow a readonly array out of a union.
function isArray(value: unknown): value is readonly (Address | BatcherEntry)[] {
  return Array.isArray(value);
}

function entryOf(batcher: Address | BatcherEntry, where: string): BatcherEntry {
  if (typeof batcher === "string") {
    return { address: requireAddress(batcher, where) };
  }
  const address = requireAddress(batcher.address, where);
  const { lastBatchId } = batcher;
  if (lastBatchId === undefined) {
    return { address };
  }
  // A non-bigint can compare false and keep the batcher open past its last batch; a negative one closes it for good.
  if (typeof lastBatchId !== "bigint" || lastBatchId < 0n) {
    throw new ConfigurationError(
      `${where} ${address} has an invalid lastBatchId: ${String(lastBatchId)}`,
    );
  }
  return { address, lastBatchId };
}

function requireAddress(value: unknown, where: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
  return getAddress(value);
}
