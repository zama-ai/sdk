import { getAddress, type Address } from "viem";
import type { MutationFactoryOptions, QueryFactoryOptions } from "../../query/factory-types";
import type { QueryClientLike } from "../../query/invalidation";
import { zamaQueryKeys } from "../../query/query-keys";
import { filterQueryOptions } from "../../query/utils";
import type { TransactionResult } from "../../types";
import { assertNonNullable } from "../../utils/assertions";
import type { VaultClient } from "../client";
import { chainIdOf, type Vault, type VaultGroup, type VaultIdOf } from "../config";
import type {
  Batch,
  BatchRef,
  BatcherRef,
  JoinDirection,
  JoinOutcome,
  OpenBatch,
  JoinInput,
  SendJoinOptions,
} from "../types";

/** How often a batch waiting for a keeper is read again. */
const KEEPER_POLL_MS = 15_000;

// A timer delay above 2^31 - 1 ms overflows and fires at once.
const MAX_REFETCH_MS = 60 * 60 * 1000;

export const vaultQueryKeys = {
  /** A prefix of every vault key. */
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
  openBatches: (target: Vault | VaultGroup, direction: JoinDirection) =>
    [
      "zama.vault",
      {
        kind: "openBatches",
        chainId: chainIdOf(target),
        // A vault and a group may share an id, and read different batchers.
        scope: "vaults" in target ? "group" : "vault",
        id: target.id,
        direction,
      },
    ] as const,
};

export interface BatchQueryConfig {
  /** The query is disabled while this is `undefined`. */
  batch?: BatchRef;
  account?: Address;
  /** TanStack Query options; only `enabled` takes effect. */
  query?: Record<string, unknown>;
}

/** How long to wait before reading a batch again, or `false` once it is finalized or canceled. */
function batchRefetchInterval(read: Batch | undefined): number | false {
  if (read === undefined || read.state === "finalized" || read.state === "canceled") {
    return false;
  }
  if (read.nextChangeAt === null) {
    return KEEPER_POLL_MS;
  }
  const untilEdge = Math.min(
    Number(read.nextChangeAt - read.observedAt) * 1000 + 1000,
    MAX_REFETCH_MS,
  );
  // A dispatched batch waits for a settlement from the start, so it polls before its deadline too.
  return read.state === "dispatched" ? Math.min(untilEdge, KEEPER_POLL_MS) : untilEdge;
}

/**
 * Query options that read one batch with {@link VaultClient.readBatch}. They refetch when the
 * batch's `nextChangeAt` passes, and poll while it waits for a keeper; a `refetchInterval` passed
 * to `useQuery` replaces both.
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
      return client.readBatch(batch, account);
    },
    enabled: batch !== undefined && queryOpts.enabled !== false,
  };
}

export type VaultSelection =
  | { readonly group: VaultGroup; readonly vault?: never }
  | { readonly vault: Vault; readonly group?: never };

function selected(selection: VaultSelection): Vault | VaultGroup {
  return selection.vault ?? selection.group;
}

export type OpenBatchesQueryConfig = VaultSelection & {
  /** Whether the deposit or the redeem batchers are read. */
  direction: JoinDirection;
  /** TanStack Query options; none takes effect. */
  query?: Record<string, unknown>;
};

/** Query options that read the open batch of every vault of a group, or of a vault on its own. */
export function openBatchesQueryOptions(
  client: VaultClient,
  config: OpenBatchesQueryConfig,
): QueryFactoryOptions<
  readonly OpenBatch[],
  Error,
  readonly OpenBatch[],
  ReturnType<typeof vaultQueryKeys.openBatches>
> {
  const target = selected(config);
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: vaultQueryKeys.openBatches(target, config.direction),
    queryFn: async () => client.readOpenBatches(target, config.direction),
  };
}

/** Invalidates every vault read and every confidential balance. */
export function invalidateAfterVaultAction(queryClient: QueryClientLike): void {
  void queryClient.invalidateQueries({ queryKey: vaultQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalance.all });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

/** A vault of a group, picked by id, or a vault on its own. */
export type JoinVariables<TGroup extends VaultGroup = VaultGroup> = Pick<JoinInput, "amount"> &
  SendJoinOptions &
  (
    | { readonly group: TGroup; readonly vaultId: VaultIdOf<TGroup>; readonly vault?: never }
    | { readonly vault: Vault; readonly vaultId?: never; readonly group?: never }
  );

function joinMutation(client: VaultClient, direction: JoinDirection) {
  return {
    mutationKey: [`zama.vault.${direction}`] as const,
    mutationFn: async ({ skipBalanceCheck, onJoinSubmitted, amount, ...target }: JoinVariables) => {
      const options = { skipBalanceCheck, onJoinSubmitted };
      return target.vault === undefined
        ? client[direction](target.group, { vaultId: target.vaultId, amount }, options)
        : client[direction](target.vault, { amount }, options);
    },
  };
}

export function depositMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.deposit"], JoinVariables, JoinOutcome> {
  return joinMutation(client, "deposit") as MutationFactoryOptions<
    readonly ["zama.vault.deposit"],
    JoinVariables,
    JoinOutcome
  >;
}

export function redeemMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.redeem"], JoinVariables, JoinOutcome> {
  return joinMutation(client, "redeem") as MutationFactoryOptions<
    readonly ["zama.vault.redeem"],
    JoinVariables,
    JoinOutcome
  >;
}

export function claimMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<
  readonly ["zama.vault.claim"],
  BatchRef & { readonly account?: Address },
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.claim"] as const,
    mutationFn: async ({ account, ...batch }) => client.claim(batch, account),
  };
}

export function quitMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.quit"], BatchRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.quit"] as const,
    mutationFn: async (batch) => client.quit(batch),
  };
}

export function dispatchMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.dispatch"], BatcherRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.dispatch"] as const,
    mutationFn: async (batch) => client.dispatch(batch),
  };
}

export function finalizeMutationOptions(
  client: VaultClient,
): MutationFactoryOptions<readonly ["zama.vault.finalize"], BatchRef, TransactionResult> {
  return {
    mutationKey: ["zama.vault.finalize"] as const,
    mutationFn: async (batch) => client.finalize(batch),
  };
}
