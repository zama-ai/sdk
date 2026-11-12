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

/** What {@link defineVault} takes. */
export interface VaultConfig<TVaultId extends string = string> {
  /** Names the vault in errors and query keys, and is what a group join passes as `vaultId`. */
  readonly id: TVaultId;
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
  /**
   * The batcher each direction joins: an address, or a history once it has
   * been upgraded. The tokens are read from the batchers.
   */
  readonly batchers: Readonly<Record<JoinDirection, Address | BatcherHistory>>;
}

declare const defined: unique symbol;

/** What {@link defineVault} returns: addresses checksummed, batchers as histories. Only it can make one. */
export interface Vault<TVaultId extends string = string> {
  /** Names the vault in errors and query keys, and is what a group join passes as `vaultId`. */
  readonly id: TVaultId;
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
  /** Every batcher of each direction, a plain address turned into a history. */
  readonly batchers: Readonly<Record<JoinDirection, BatcherHistory>>;
  /** Type-only brand: a hand-built object does not type-check as a vault. */
  readonly [defined]: true;
}

/** What {@link defineVaultGroup} takes. */
export interface VaultGroupConfig<
  TGroupId extends string = string,
  TVaultId extends string = string,
> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /**
   * The vaults, from {@link defineVault}, in leg order. Never reorder them
   * once users have joined. They must be on one chain, and their deposit
   * batchers must take the same confidential asset.
   */
  readonly vaults: readonly Vault<TVaultId>[];
}

/** What {@link defineVaultGroup} returns. Only it can make one. */
export interface VaultGroup<TGroupId extends string = string, TVaultId extends string = string> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /** The chain every vault of the group is on. */
  readonly chainId: number;
  /** The vaults, in leg order. */
  readonly vaults: readonly [Vault<TVaultId>, ...Vault<TVaultId>[]];
  /** Type-only brand: a hand-built object does not type-check as a group. */
  readonly [defined]: true;
}

/** The vault ids of a group. */
export type VaultIdOf<TGroup extends VaultGroup> =
  TGroup extends VaultGroup<string, infer TVaultId> ? TVaultId : never;

/**
 * The group a join covers. A vault on its own joins as a group of one, which
 * reaches its batcher directly.
 *
 * @internal
 */
export function toGroup(target: Vault | VaultGroup): VaultGroup {
  if ("vaults" in target) {
    return target;
  }
  return { id: target.id, chainId: target.chainId, vaults: [target] } as unknown as VaultGroup;
}

function requireAddress(value: unknown, where: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
  return getAddress(value);
}

function batchersOf(vault: Vault): Address[] {
  return [vault.batchers.deposit, vault.batchers.redeem].flatMap((history) => [
    ...history.retired.map((entry) => entry.address),
    history.latest,
  ]);
}

// A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
function requireDistinctBatchers(vaults: readonly Vault[], where: string): void {
  const seen = new Set<Address>();
  for (const batcher of vaults.flatMap(batchersOf)) {
    if (seen.has(batcher)) {
      throw new ConfigurationError(`${where} uses batcher ${batcher} more than once`);
    }
    seen.add(batcher);
  }
}

/**
 * Validate one vault, and keep its id as a literal type. Reads nothing from
 * chain: the client reads each batcher's token on the first join. Join it on
 * its own, or put it in a {@link defineVaultGroup} group.
 *
 * @example
 * ```ts
 * export const ALPHA = defineVault({
 *   id: "alpha",
 *   chainId: 1,
 *   batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
 * });
 * ```
 *
 * @throws if `chainId`, an address or a `lastBatchId` is invalid, or a batcher appears twice. {@link ConfigurationError}
 */
export function defineVault<const TVaultId extends string>(
  config: VaultConfig<TVaultId>,
): Vault<TVaultId> {
  const where = `Vault "${config.id}"`;
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    throw new ConfigurationError(`${where} has an invalid chainId: ${config.chainId}`);
  }
  const history = (declared: Address | BatcherHistory, at: string): BatcherHistory =>
    typeof declared === "string"
      ? { retired: [], latest: requireAddress(declared, at) }
      : {
          retired: declared.retired.map((entry) => {
            if (typeof entry.lastBatchId !== "bigint" || entry.lastBatchId < 0n) {
              throw new ConfigurationError(
                `${at} has a retired batcher with an invalid lastBatchId`,
              );
            }
            return { address: requireAddress(entry.address, at), lastBatchId: entry.lastBatchId };
          }),
          latest: requireAddress(declared.latest, at),
        };
  const vault = {
    id: config.id,
    chainId: config.chainId,
    batchers: {
      deposit: history(config.batchers.deposit, `${where} deposit batcher`),
      redeem: history(config.batchers.redeem, `${where} redeem batcher`),
    },
  } as unknown as Vault<TVaultId>;
  requireDistinctBatchers([vault], where);
  return vault;
}

/**
 * Group vaults that take deposits in one confidential asset, and keep the
 * ids as literal types. A join into the group sends a leg to every vault, so
 * the chain cannot tell which one was chosen. Reads nothing from chain.
 *
 * @example
 * ```ts
 * export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
 * ```
 *
 * @throws if the group has no vault or more than {@link MAX_GROUP_VAULTS}, its vaults are on different chains, a vault id repeats, or a batcher appears twice. {@link ConfigurationError}
 */
export function defineVaultGroup<const TGroupId extends string, const TVaultId extends string>(
  config: VaultGroupConfig<TGroupId, TVaultId>,
): VaultGroup<TGroupId, TVaultId> {
  const where = `Vault group "${config.id}"`;
  const [first] = config.vaults;
  if (first === undefined) {
    throw new ConfigurationError(`${where} has no vault`);
  }
  if (config.vaults.length > MAX_GROUP_VAULTS) {
    throw new ConfigurationError(
      `${where} has ${config.vaults.length} vaults, more than ${MAX_GROUP_VAULTS}`,
    );
  }
  const vaultIds = new Set<string>();
  for (const vault of config.vaults) {
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
  requireDistinctBatchers(config.vaults, where);
  return {
    id: config.id,
    chainId: first.chainId,
    vaults: [...config.vaults],
  } as unknown as VaultGroup<TGroupId, TVaultId>;
}
