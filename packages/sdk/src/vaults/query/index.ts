import { getAddress } from "viem";
import type { MutationFactoryOptions, QueryFactoryOptions } from "../../query/factory-types";
import type { QueryClientLike } from "../../query/invalidation";
import { zamaQueryKeys } from "../../query/query-keys";
import { filterQueryOptions } from "../../query/utils";
import { assertNonNullable } from "../../utils/assertions";
import type { VaultClient, VaultJoinParams, VaultPosition, VaultRecord } from "../client";
import type { GroupId, VaultId, VaultsConfig } from "../config";
import type { ActionOutcome, Direction, JoinOptions, JoinOutcome, OpenBatch } from "../types";

/** How often a position is read again while a batch settles, which no chain time predicts. */
const SETTLING_POLL_MS = 15_000;

/**
 * Query keys for the vaults module. A `group(...)` key is a prefix of every
 * key of that group, so invalidating it clears all of them.
 */
export const vaultQueryKeys = {
  all: ["zama.vault"] as const,
  group: (chainId: number, groupId: string) => ["zama.vault", { chainId, groupId }] as const,
  position: (record: VaultRecord<VaultsConfig> | undefined, decrypt: boolean) =>
    [
      "zama.vault",
      {
        chainId: record?.chainId,
        groupId: record?.groupId,
        kind: "position",
        direction: record?.direction,
        account: record ? getAddress(record.account) : undefined,
        batchIds: record?.legs.map((leg) => leg.batchId),
        decrypt,
      },
    ] as const,
  openBatches: (chainId: number, groupId: string, direction: Direction) =>
    ["zama.vault", { chainId, groupId, kind: "openBatches", direction }] as const,
};

/** Configuration for {@link positionQueryOptions}. */
export interface PositionQueryConfig<TConfig extends VaultsConfig> {
  /** The join to read. The query stays disabled until it is set. */
  record?: VaultRecord<TConfig>;
  /** Decrypt every leg's deposit, as the signer. */
  decrypt?: boolean;
  /** Additional TanStack Query options merged into the generated query. */
  query?: Record<string, unknown>;
}

/**
 * Query options over {@link VaultClient.readPosition}. Refetches when the
 * position's `nextChangeAt` passes, and polls while a leg settles.
 */
export function positionQueryOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
  config: PositionQueryConfig<TConfig> = {},
): QueryFactoryOptions<
  VaultPosition<TConfig>,
  Error,
  VaultPosition<TConfig>,
  ReturnType<typeof vaultQueryKeys.position>
> {
  const queryOpts = config.query ?? {};
  const record = config.record;
  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.position(record, config.decrypt ?? false),
    queryFn: async () => {
      assertNonNullable(record, "positionQueryOptions: record");
      return client.readPosition(record, { decrypt: config.decrypt });
    },
    refetchInterval: (query) => {
      const position = query.state.data;
      if (position === undefined) {
        return false;
      }
      if (position.phase === "settling") {
        return SETTLING_POLL_MS;
      }
      // One second past the edge, so the read lands in a block at or after it.
      return position.nextChangeAt === null
        ? false
        : Number(position.nextChangeAt - position.observedAt) * 1000 + 1000;
    },
    enabled: record !== undefined && queryOpts.enabled !== false,
  };
}

/** Configuration for {@link openBatchesQueryOptions}. */
export interface OpenBatchesQueryConfig<TGroupId extends string> {
  /** The group to read. */
  groupId: TGroupId;
  /** Whether to read the deposit or the redeem batchers. */
  direction: Direction;
  /** Additional TanStack Query options merged into the generated query. */
  query?: Record<string, unknown>;
}

/** Query options over {@link VaultClient.readOpenBatches}. */
export function openBatchesQueryOptions<
  TConfig extends VaultsConfig,
  TGroupId extends GroupId<TConfig>,
>(
  client: VaultClient<TConfig>,
  config: OpenBatchesQueryConfig<TGroupId>,
): QueryFactoryOptions<
  readonly OpenBatch<VaultId<TConfig, TGroupId>>[],
  Error,
  readonly OpenBatch<VaultId<TConfig, TGroupId>>[],
  ReturnType<typeof vaultQueryKeys.openBatches>
> {
  const queryOpts = config.query ?? {};
  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.openBatches(client.chainId, config.groupId, config.direction),
    queryFn: async () => client.readOpenBatches(config.groupId, config.direction),
  };
}

/**
 * Invalidates what a vault action changes: every read of the group and every
 * confidential balance. Call it after sending a prepared action yourself; the
 * mutation options call it for you.
 */
export function invalidateAfterVaultAction(
  queryClient: QueryClientLike,
  params: { readonly chainId: number; readonly groupId: string },
): void {
  void queryClient.invalidateQueries({
    queryKey: vaultQueryKeys.group(params.chainId, params.groupId),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

/** Variables for {@link depositMutationOptions} and {@link redeemMutationOptions}. */
export type VaultJoinVariables<TConfig extends VaultsConfig> = VaultJoinParams<TConfig> & {
  readonly options?: JoinOptions;
};

/** Mutation options over {@link VaultClient.deposit}. */
export function depositMutationOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
): MutationFactoryOptions<
  readonly ["zama.vault.deposit", number],
  VaultJoinVariables<TConfig>,
  JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>
> {
  return {
    mutationKey: ["zama.vault.deposit", client.chainId] as const,
    mutationFn: async ({ options, ...params }) =>
      client.deposit(params as VaultJoinParams<TConfig>, options),
  };
}

/** Mutation options over {@link VaultClient.redeem}. */
export function redeemMutationOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
): MutationFactoryOptions<
  readonly ["zama.vault.redeem", number],
  VaultJoinVariables<TConfig>,
  JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>
> {
  return {
    mutationKey: ["zama.vault.redeem", client.chainId] as const,
    mutationFn: async ({ options, ...params }) =>
      client.redeem(params as VaultJoinParams<TConfig>, options),
  };
}

/** Mutation options over {@link VaultClient.exit}. */
export function exitMutationOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
): MutationFactoryOptions<
  readonly ["zama.vault.exit", number],
  VaultRecord<TConfig>,
  ActionOutcome
> {
  return {
    mutationKey: ["zama.vault.exit", client.chainId] as const,
    mutationFn: async (record) => client.exit(record),
  };
}

/** Mutation options over {@link VaultClient.dispatch}. */
export function dispatchMutationOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
): MutationFactoryOptions<
  readonly ["zama.vault.dispatch", number],
  VaultRecord<TConfig>,
  ActionOutcome
> {
  return {
    mutationKey: ["zama.vault.dispatch", client.chainId] as const,
    mutationFn: async (record) => client.dispatch(record),
  };
}

/** Mutation options over {@link VaultClient.finalize}. */
export function finalizeMutationOptions<TConfig extends VaultsConfig>(
  client: VaultClient<TConfig>,
): MutationFactoryOptions<
  readonly ["zama.vault.finalize", number],
  VaultRecord<TConfig>,
  ActionOutcome
> {
  return {
    mutationKey: ["zama.vault.finalize", client.chainId] as const,
    mutationFn: async (record) => client.finalize(record),
  };
}
