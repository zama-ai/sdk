import { getAddress, isAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";
import type { Direction } from "./types";

/** The most vaults a group may hold: a join's FHE compute grows with its leg count, and eight legs is what fits one transaction. */
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
  /** The batcher each direction joins: an address, or a history once it has been upgraded. */
  readonly batchers: Readonly<Record<Direction, Address | BatcherHistory>>;
  /** The vault's confidential share token, which its redeem batchers take. */
  readonly share: Address;
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
  /** The confidential asset every deposit batcher takes. */
  readonly asset: Address;
  /**
   * The router a multi-vault join goes through. Defaults to the chain
   * preset's `vaultRouterAddress`, and must match it when the preset sets one.
   */
  readonly router?: Address;
  /** The vaults, in leg order. Never reorder them once users have joined. */
  readonly vaults: readonly VaultConfig<TVaultId>[];
}

declare const defined: unique symbol;

/** A vault of a {@link VaultGroup}: addresses checksummed, batchers as histories. */
export interface VaultGroupVault<TVaultId extends string = string> {
  /** What callers pass as `vaultId`. */
  readonly id: TVaultId;
  /** Every batcher of each direction, a plain address turned into a history. */
  readonly batchers: Readonly<Record<Direction, BatcherHistory>>;
  /** The vault's confidential share token. */
  readonly share: Address;
}

/** What {@link defineVaultGroup} returns. Only it can make one. */
export interface VaultGroup<TGroupId extends string = string, TVaultId extends string = string> {
  /** Names the group in errors and query keys. */
  readonly id: TGroupId;
  /** The chain every batcher of the group is on. */
  readonly chainId: number;
  /** The confidential asset every deposit batcher takes. */
  readonly asset: Address;
  /** The configured router, or `undefined` to use the chain preset's. */
  readonly router: Address | undefined;
  /** The vaults, in leg order. */
  readonly vaults: readonly [VaultGroupVault<TVaultId>, ...VaultGroupVault<TVaultId>[]];
  /** Marks a group made by {@link defineVaultGroup}, so a hand-built object is refused. */
  readonly [defined]: true;
}

/** The vault ids of a group. */
export type VaultIdOf<TGroup extends VaultGroup> =
  TGroup extends VaultGroup<string, infer TVaultId> ? TVaultId : never;

/** Every batcher of a history, oldest first. */
export function batcherAddresses(history: BatcherHistory): Address[] {
  return [...history.retired.map((entry) => entry.address), history.latest];
}

function requireAddress(value: unknown, where: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
  return getAddress(value);
}

/**
 * Validate a group of vaults that take deposits in one confidential asset,
 * and keep its ids as literal types. Pure: reads nothing from chain; the
 * client checks the group against the chain on its first join. A single
 * vault is a group of one.
 *
 * @example
 * ```ts
 * export const STABLE = defineVaultGroup({
 *   id: "stable",
 *   chainId: 1,
 *   asset: "0xConfidentialUSDC",
 *   vaults: [
 *     { id: "alpha", batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" }, share: "0xAlphaShare" },
 *     { id: "beta", batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" }, share: "0xBetaShare" },
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
    for (const address of batcherAddresses(normalized)) {
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
      share: requireAddress(entry.share, `${at} share`),
    };
  };

  return {
    id: config.id,
    chainId: config.chainId,
    asset: requireAddress(config.asset, `${where} asset`),
    router:
      config.router === undefined ? undefined : requireAddress(config.router, `${where} router`),
    vaults: [vault(first), ...rest.map(vault)],
  } as unknown as VaultGroup<TGroupId, TVaultId>;
}
