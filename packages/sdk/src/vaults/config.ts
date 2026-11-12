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

/** One vault of a group. */
export interface VaultConfig<TVaultId extends string = string> {
  /** What callers pass as `vaultId`. */
  readonly id: TVaultId;
  /**
   * The batcher each direction joins: an address, or a history once it has
   * been upgraded. The tokens are read from the batchers, so every deposit
   * batcher of a group must take the same confidential asset.
   */
  readonly batchers: Readonly<Record<JoinDirection, Address | BatcherHistory>>;
}

/** What {@link defineVaultGroup} takes. */
export interface VaultGroupConfig<
  TGroupId extends string = string,
  TVaultId extends string = string,
> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /** The chain every batcher of the group is on. */
  readonly chainId: number;
  /** The vaults, in leg order. Never reorder them once users have joined. */
  readonly vaults: readonly VaultConfig<TVaultId>[];
}

declare const defined: unique symbol;

/** A vault of a {@link VaultGroup}: addresses checksummed, batchers as histories. */
export interface VaultGroupVault<TVaultId extends string = string> {
  /** What callers pass as `vaultId`. */
  readonly id: TVaultId;
  /** Every batcher of each direction, a plain address turned into a history. */
  readonly batchers: Readonly<Record<JoinDirection, BatcherHistory>>;
}

/** What {@link defineVaultGroup} returns. Only it can make one. */
export interface VaultGroup<TGroupId extends string = string, TVaultId extends string = string> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /** The chain every batcher of the group is on. */
  readonly chainId: number;
  /** The vaults, in leg order. */
  readonly vaults: readonly [VaultGroupVault<TVaultId>, ...VaultGroupVault<TVaultId>[]];
  /** Type-only brand: a hand-built object does not type-check as a group. */
  readonly [defined]: true;
}

/** What {@link defineVault} takes: one vault, with its chain. */
export interface SingleVaultConfig<TVaultId extends string = string> extends VaultConfig<TVaultId> {
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
}

/** What {@link defineVault} returns. Only it can make one. */
export interface Vault<TVaultId extends string = string> extends VaultGroupVault<TVaultId> {
  /** The chain the vault's batchers are on. */
  readonly chainId: number;
  /** Type-only brand: a hand-built object does not type-check as a vault. */
  readonly [defined]: true;
}

/** What joins and open-batch reads act on: a group, or a single vault. */
export type VaultTarget = VaultGroup | Vault;

/** The vault ids of a group, or the id of a single vault. */
export type VaultIdOf<TTarget extends VaultTarget> =
  TTarget extends VaultGroup<string, infer TVaultId>
    ? TVaultId
    : TTarget extends Vault<infer TVaultId>
      ? TVaultId
      : never;

/**
 * The group a target joins. A single vault joins as a group of one, which
 * reaches its batcher directly.
 *
 * @internal
 */
export function toGroup(target: VaultTarget): VaultGroup {
  if ("vaults" in target) {
    return target;
  }
  const { chainId, ...vault } = target;
  return { id: vault.id, chainId, vaults: [vault] } as unknown as VaultGroup;
}

function requireAddress(value: unknown, where: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
  return getAddress(value);
}

/**
 * Validate a group of vaults that take deposits in one confidential asset,
 * and keep its ids as literal types. Reads nothing from chain: the client
 * reads each batcher's token on the first join. For one vault
 * on its own, use {@link defineVault}.
 *
 * @example
 * ```ts
 * export const STABLE = defineVaultGroup({
 *   id: "stable",
 *   chainId: 1,
 *   vaults: [
 *     { id: "alpha", batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" } },
 *     { id: "beta", batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" } },
 *   ],
 * });
 * ```
 *
 * @throws if the group has no vault or more than {@link MAX_GROUP_VAULTS}, a vault id repeats, a batcher appears twice, or an address or `lastBatchId` is invalid. {@link ConfigurationError}
 */
export function defineVaultGroup<const TGroupId extends string, const TVaultId extends string>(
  config: VaultGroupConfig<TGroupId, TVaultId>,
): VaultGroup<TGroupId, TVaultId> {
  const where = `Vault group "${config.id}"`;
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    throw new ConfigurationError(`${where} has an invalid chainId: ${config.chainId}`);
  }
  const [first, ...rest] = config.vaults;
  if (first === undefined) {
    throw new ConfigurationError(`${where} has no vault`);
  }
  if (config.vaults.length > MAX_GROUP_VAULTS) {
    throw new ConfigurationError(
      `${where} has ${config.vaults.length} vaults, more than ${MAX_GROUP_VAULTS}`,
    );
  }
  const vaultIds = new Set<string>();
  const batchers = new Set<Address>();

  const history = (declared: Address | BatcherHistory, at: string): BatcherHistory => {
    const normalized =
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
    // A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
    for (const address of [
      ...normalized.retired.map((entry) => entry.address),
      normalized.latest,
    ]) {
      if (batchers.has(address)) {
        throw new ConfigurationError(`${where} uses batcher ${address} more than once`);
      }
      batchers.add(address);
    }
    return normalized;
  };

  const vault = (entry: VaultConfig<TVaultId>): VaultGroupVault<TVaultId> => {
    if (vaultIds.has(entry.id)) {
      throw new ConfigurationError(`${where} names vault "${entry.id}" twice`);
    }
    vaultIds.add(entry.id);
    const at = `Vault "${entry.id}" of group "${config.id}"`;
    return {
      id: entry.id,
      batchers: {
        deposit: history(entry.batchers.deposit, `${at} deposit batcher`),
        redeem: history(entry.batchers.redeem, `${at} redeem batcher`),
      },
    };
  };

  return {
    id: config.id,
    chainId: config.chainId,
    vaults: [vault(first), ...rest.map(vault)],
  } as unknown as VaultGroup<TGroupId, TVaultId>;
}

/**
 * Validate one vault on its own, and keep its id as a literal type. Reads
 * nothing from chain. A join into it needs no `vaultId`.
 *
 * @example
 * ```ts
 * export const MAIN = defineVault({
 *   id: "main",
 *   chainId: 1,
 *   batchers: { deposit: "0xMainDeposit", redeem: "0xMainRedeem" },
 * });
 * ```
 *
 * @throws as {@link defineVaultGroup}. {@link ConfigurationError}
 */
export function defineVault<const TVaultId extends string>(
  config: SingleVaultConfig<TVaultId>,
): Vault<TVaultId> {
  const { chainId, ...vault } = config;
  const group = defineVaultGroup({ id: config.id, chainId, vaults: [vault] });
  return { ...group.vaults[0], chainId: group.chainId } as unknown as Vault<TVaultId>;
}
