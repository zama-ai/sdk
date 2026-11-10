import { getAddress, isAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";

/** The most vaults a group may name: the router's per-call leg limit. */
export const MAX_GROUP_VAULTS = 10;

/**
 * Every batcher a vault has had in one direction, for a batcher upgrade.
 * A retired batcher takes joins while its `currentBatchId` is at most
 * `lastBatchId`; after that, joins go to the next one, and finally to
 * `latest`. So the switch happens when the last configured batch is
 * dispatched, never on the clock. A retired batcher's batches can still be
 * read and exited, so never remove an entry.
 */
export interface BatcherHistory {
  /** Oldest first. */
  readonly retired: readonly { readonly address: Address; readonly lastBatchId: bigint }[];
  /** The batcher joins reach once every retired one has passed its `lastBatchId`. */
  readonly latest: Address;
}

/**
 * One vault: the batcher joined to deposit the group's asset, and the one
 * joined to redeem its shares. Each is an address, or a {@link BatcherHistory}
 * once the vault's batcher has been upgraded.
 */
export interface VaultConfig {
  /** The batcher a deposit of the group's asset joins. */
  readonly depositBatcher: Address | BatcherHistory;
  /** The batcher a redemption of the vault's shares joins. */
  readonly redeemBatcher: Address | BatcherHistory;
}

/**
 * The history of a batcher config, checksummed. A plain address is a history
 * with nothing retired.
 *
 * @internal
 */
export function toBatcherHistory(batcher: Address | BatcherHistory): BatcherHistory {
  return typeof batcher === "string"
    ? { retired: [], latest: getAddress(batcher) }
    : {
        retired: batcher.retired.map((entry) => ({ ...entry, address: getAddress(entry.address) })),
        latest: getAddress(batcher.latest),
      };
}

/** Every batcher of a history, oldest first. @internal */
export function batcherAddresses(history: BatcherHistory): Address[] {
  return [...history.retired.map((entry) => entry.address), history.latest];
}

/** Vaults that take deposits in the same confidential asset. A join sends a leg to every one of them. */
export interface VaultGroupConfig {
  /** The confidential asset every vault in the group takes deposits in. */
  readonly asset: Address;
  /** The vaults, keyed by id. Key order is the leg order, so never reorder it after launch. */
  readonly vaults: Readonly<Record<string, VaultConfig>>;
}

/** What {@link defineVaults} takes. */
export interface VaultsConfig {
  /** The chain every batcher is on. Reads go to it whatever chain the wallet is on. */
  readonly chainId: number;
  /**
   * The router a multi-vault join goes through. Defaults to the chain's
   * `vaultRouterAddress`; when the chain has one, this must match it.
   */
  readonly router?: Address;
  /** The groups, keyed by id. */
  readonly groups: Readonly<Record<string, VaultGroupConfig>>;
}

/** The group ids of a config. */
export type GroupId<TConfig extends VaultsConfig> = keyof TConfig["groups"] & string;

/** The vault ids of one group of a config. */
export type VaultId<
  TConfig extends VaultsConfig,
  TGroupId extends GroupId<TConfig> = GroupId<TConfig>,
> = keyof TConfig["groups"][TGroupId]["vaults"] & string;

function requireAddress(value: unknown, where: string): void {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new ConfigurationError(`${where} is not an address: ${String(value)}`);
  }
}

/**
 * Validate a vaults config and keep its group and vault ids as literal types.
 * Pure: reads nothing from chain. {@link createVaultClient} checks the config
 * against the chain on first use.
 *
 * @example
 * ```ts
 * export const VAULTS = defineVaults({
 *   chainId: 1,
 *   groups: {
 *     stable: {
 *       asset: "0xConfidentialUSDC",
 *       vaults: {
 *         alpha: { depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
 *         beta: { depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * @throws if a group names no vault or more than {@link MAX_GROUP_VAULTS}, an address is invalid, or a batcher appears twice. {@link ConfigurationError}
 */
export function defineVaults<const TConfig extends VaultsConfig>(config: TConfig): TConfig {
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    throw new ConfigurationError(`Vaults config has an invalid chainId: ${config.chainId}`);
  }
  if (config.router !== undefined) {
    requireAddress(config.router, "Vaults config router");
  }
  const batchers = new Set<Address>();
  for (const [groupId, group] of Object.entries(config.groups)) {
    requireAddress(group.asset, `Group "${groupId}" asset`);
    const vaults = Object.entries(group.vaults);
    if (vaults.length === 0) {
      throw new ConfigurationError(`Group "${groupId}" names no vault`);
    }
    if (vaults.length > MAX_GROUP_VAULTS) {
      throw new ConfigurationError(
        `Group "${groupId}" names ${vaults.length} vaults, above the ${MAX_GROUP_VAULTS} a join can carry`,
      );
    }
    for (const [vaultId, vault] of vaults) {
      for (const side of ["depositBatcher", "redeemBatcher"] as const) {
        const where = `Vault "${vaultId}" of group "${groupId}" ${side}`;
        const declared = vault[side];
        const entries =
          typeof declared === "string"
            ? [declared]
            : [...declared.retired.map((entry) => entry.address), declared.latest];
        for (const entry of entries) {
          requireAddress(entry, where);
        }
        if (typeof declared !== "string") {
          for (const { lastBatchId } of declared.retired) {
            if (typeof lastBatchId !== "bigint" || lastBatchId < 0n) {
              throw new ConfigurationError(
                `${where} has a retired batcher with an invalid lastBatchId`,
              );
            }
          }
        }
        for (const entry of entries) {
          const batcher = getAddress(entry);
          // A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
          if (batchers.has(batcher)) {
            throw new ConfigurationError(`Vaults config names batcher ${batcher} more than once`);
          }
          batchers.add(batcher);
        }
      }
    }
  }
  return config;
}
