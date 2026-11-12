import { getAddress, isAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";
import type { JoinDirection } from "./types";

/** The most vaults a group may hold; every join sends a leg to each of them. */
export const MAX_GROUP_VAULTS = 8;

/** A batcher that took joins while its `currentBatchId` was at most `lastBatchId`. */
export interface RetiredBatcher {
  /** The retired batcher. */
  readonly address: Address;
  /** The last batch it took joins into. */
  readonly lastBatchId: bigint;
}

/**
 * Every batcher a vault has had in one direction, for a batcher upgrade. A
 * join goes to the first retired batcher whose `currentBatchId` is still at
 * most its `lastBatchId`, else to `latest`, so the switch happens when the
 * last configured batch is dispatched, never on the clock. A retired
 * batcher's batches can still be read, claimed and quit, so never remove an
 * entry.
 */
export interface BatcherHistory {
  /** Oldest first. */
  readonly retired: readonly RetiredBatcher[];
  /** The batcher joins reach once every retired one has passed its `lastBatchId`. */
  readonly latest: Address;
}

/**
 * One vault: its chain and the batcher each direction joins. Plain data,
 * written once and joined on its own or put in any number of groups. Nothing
 * is checked when it is defined: the client checks what a join or a read
 * relies on when it runs, and reads each batcher's token from chain.
 */
export interface Vault<TVaultId extends string = string> {
  /** Names the vault in errors and query keys, and is what a group join passes as `vaultId`. */
  readonly id: TVaultId;
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
  /** The batcher each direction joins: an address, or a history once it has been upgraded. */
  readonly batchers: Readonly<Record<JoinDirection, Address | BatcherHistory>>;
}

/**
 * Vaults that take deposits in one confidential asset, joined together so
 * the chain cannot tell which one was chosen. Two vaults at least: a lone
 * vault has nothing to hide its leg among, so it is joined on its own.
 */
export interface VaultGroup<TGroupId extends string = string, TVaultId extends string = string> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /**
   * The vaults, in leg order, up to {@link MAX_GROUP_VAULTS}. Never reorder
   * them once users have joined. They must be on one chain, and their deposit
   * batchers must take the same confidential asset.
   */
  readonly vaults: readonly [Vault<TVaultId>, Vault<TVaultId>, ...Vault<TVaultId>[]];
}

/** The vault ids of a group. */
export type VaultIdOf<TGroup extends VaultGroup> =
  TGroup extends VaultGroup<string, infer TVaultId> ? TVaultId : never;

/**
 * Define a vault, keeping its id as a literal type. Returns `vault` as is and
 * checks nothing, like viem's `defineChain`.
 *
 * @example
 * ```ts
 * export const ALPHA = defineVault({
 *   id: "alpha",
 *   chainId: 1,
 *   batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
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
 * Every batcher of `vault` in `direction`, checksummed: a plain address is a history with nothing retired.
 *
 * @internal
 * @throws if an address or a `lastBatchId` is invalid. {@link ConfigurationError}
 */
export function historyOf(vault: Vault, direction: JoinDirection): BatcherHistory {
  const declared = vault.batchers[direction];
  const where = `Vault "${vault.id}" ${direction} batcher`;
  if (typeof declared === "string") {
    return { retired: [], latest: requireAddress(declared, where) };
  }
  return {
    retired: declared.retired.map((entry) => {
      // Anything but a non-negative bigint compares false, so the join would silently skip the retired batcher.
      if (typeof entry.lastBatchId !== "bigint" || entry.lastBatchId < 0n) {
        throw new ConfigurationError(
          `${where} has a retired batcher with an invalid lastBatchId: ${String(entry.lastBatchId)}`,
        );
      }
      return { address: requireAddress(entry.address, where), lastBatchId: entry.lastBatchId };
    }),
    latest: requireAddress(declared.latest, where),
  };
}

function requireAddress(value: unknown, where: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
  return getAddress(value);
}
