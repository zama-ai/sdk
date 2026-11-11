import { getAddress, type Address } from "viem";
import type { MutationFactoryOptions, QueryFactoryOptions } from "../../query/factory-types";
import type { QueryClientLike } from "../../query/invalidation";
import { zamaQueryKeys } from "../../query/query-keys";
import { filterQueryOptions } from "../../query/utils";
import type { TransactionResult } from "../../types";
import { assertNonNullable } from "../../utils/assertions";
import type { VaultClient } from "../client";
import type { VaultGroup, VaultIdOf } from "../config";
import type {
  Batch,
  BatchRef,
  BatcherRef,
  Direction,
  JoinOutcome,
  OpenBatch,
  SendJoinInput,
  SendJoinOptions,
} from "../types";

/** How often a batch waiting for a keeper is read again. */
const KEEPER_POLL_MS = 15_000;

/** The longest wait between reads. A timer delay above 2^31 - 1 ms overflows and fires at once. */
const MAX_REFETCH_MS = 60 * 60 * 1000;

/** Query keys for the vaults module. `all` is a prefix of every vault key. */
export const vaultQueryKeys = {
  all: ["zama.vault"] as const,
  batch: (batch: BatchRef | undefined, account: Address | undefined) =>
    [
      "zama.vault",
      {
        kind: "batch",
        chainId: batch?.chainId,
        batcher: batch === undefined ? undefined : getAddress(batch.batcher),
        batchId: batch?.batchId,
        account: account === undefined ? undefined : getAddress(account),
      },
    ] as const,
  openBatches: (group: VaultGroup, direction: Direction) =>
    [
      "zama.vault",
      { kind: "openBatches", chainId: group.chainId, groupId: group.id, direction },
    ] as const,
};

/** Configuration for {@link batchQueryOptions}. */
export interface BatchQueryConfig {
  /** The batch to read. The query stays disabled until it is set. */
  batch?: BatchRef;
  /** Read this account's deposit, and list `claim` and `quit` for it. */
  account?: Address;
  /** Additional TanStack Query options merged into the generated query. */
  query?: Record<string, unknown>;
}

/**
 * When to read a batch again: one second past its next chain-time edge, or
 * on a poll while it waits for someone else's transaction (a dispatch once it
 * is old enough, a settlement once dispatched), which no chain time predicts.
 */
function batchRefetchInterval(read: Batch | undefined): number | false {
  if (read === undefined || read.state === "finalized" || read.state === "canceled") {
    return false;
  }
  if (read.nextChangeAt === null) {
    return KEEPER_POLL_MS;
  }
  return Math.min(Number(read.nextChangeAt - read.observedAt) * 1000 + 1000, MAX_REFETCH_MS);
}

/**
 * Query options over {@link VaultClient.readBatch}. Refetches when the
 * batch's `nextChangeAt` passes, and polls while it waits for a dispatch or a
 * settlement. Pass your own `refetchInterval` to `useQuery` to replace it.
 */
export function batchQueryOptions(
  client: VaultClient,
  config: BatchQueryConfig = {},
): QueryFactoryOptions<Batch, Error, Batch, ReturnType<typeof vaultQueryKeys.batch>> {
  const queryOpts = config.query ?? {};
  const { batch, account } = config;
  return {
    refetchInterval: (query) => batchRefetchInterval(query.state.data),
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.batch(batch, account),
    queryFn: async () => {
      assertNonNullable(batch, "batchQueryOptions: batch");
      return client.readBatch({ ...batch, account });
    },
    enabled: batch !== undefined && queryOpts.enabled !== false,
  };
}

/** Configuration for {@link openBatchesQueryOptions}. */
export interface OpenBatchesQueryConfig {
  /** The group to read. */
  group: VaultGroup;
  /** Whether to read the deposit or the redeem batchers. */
  direction: Direction;
  /** Additional TanStack Query options merged into the generated query. */
  query?: Record<string, unknown>;
}

/** Query options over {@link VaultClient.readOpenBatches}. */
export function openBatchesQueryOptions(
  client: VaultClient,
  config: OpenBatchesQueryConfig,
): QueryFactoryOptions<
  readonly OpenBatch[],
  Error,
  readonly OpenBatch[],
  ReturnType<typeof vaultQueryKeys.openBatches>
> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: vaultQueryKeys.openBatches(config.group, config.direction),
    queryFn: async () => client.readOpenBatches(config.group, config.direction),
  };
}

/**
 * Invalidates what a vault transaction changes: every vault read and every
 * confidential balance. Call it after sending prepared calls yourself; the
 * React mutation hooks call it for you.
 */
export function invalidateAfterVaultAction(queryClient: QueryClientLike): void {
  void queryClient.invalidateQueries({ queryKey: vaultQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

/** Variables for {@link depositMutationOptions} and {@link redeemMutationOptions}. */
export interface JoinVariables<TGroup extends VaultGroup = VaultGroup>
  extends SendJoinInput<VaultIdOf<TGroup>>, SendJoinOptions {
  /** The group to join. */
  readonly group: TGroup;
}

function joinMutation(client: VaultClient, direction: Direction) {
  return {
    mutationKey: [`zama.vault.${direction}`] as const,
    mutationFn: async ({ group, skipChecks, onJoinSubmitted, ...input }: JoinVariables) =>
      client[direction](group, input, { skipChecks, onJoinSubmitted }),
  };
}

/** Mutation options over {@link VaultClient.deposit}. */
export function depositMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.deposit"], JoinVariables, JoinOutcome> {
  return joinMutation(client, "deposit") as MutationFactoryOptions<
    readonly ["zama.vault.deposit"],
    JoinVariables,
    JoinOutcome
  >;
}

/** Mutation options over {@link VaultClient.redeem}. */
export function redeemMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.redeem"], JoinVariables, JoinOutcome> {
  return joinMutation(client, "redeem") as MutationFactoryOptions<
    readonly ["zama.vault.redeem"],
    JoinVariables,
    JoinOutcome
  >;
}

/** Mutation options over {@link VaultClient.claim}. */
export function claimMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<
  readonly ["zama.vault.claim"],
  BatchRef & { readonly account?: Address },
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.claim"] as const,
    mutationFn: async (batch) => client.claim(batch),
  };
}

/** Mutation options over {@link VaultClient.quit}. */
export function quitMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.quit"], BatchRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.quit"] as const,
    mutationFn: async (batch) => client.quit(batch),
  };
}

/** Mutation options over {@link VaultClient.dispatch}. */
export function dispatchMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.dispatch"], BatcherRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.dispatch"] as const,
    mutationFn: async (batch) => client.dispatch(batch),
  };
}

/** Mutation options over {@link VaultClient.finalize}. */
export function finalizeMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.finalize"], BatchRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.finalize"] as const,
    mutationFn: async (batch) => client.finalize(batch),
  };
}
