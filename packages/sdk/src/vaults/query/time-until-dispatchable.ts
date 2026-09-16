import { assertNonNullable } from "../../utils/assertions";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link timeUntilDispatchableQueryOptions}. */
export interface TimeUntilDispatchableQueryConfig {
  /** Batch to check; the query stays disabled until provided. */
  batchId?: bigint;
  /**
   * Poll interval in milliseconds for a live countdown. Shorthand for
   * `query.refetchInterval`, which is also honoured; omit both to fetch once.
   */
  refetchInterval?: number;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for the seconds remaining until a batch can be dispatched —
 * see {@link VaultBatcher.timeUntilDispatchable}.
 */
export function timeUntilDispatchableQueryOptions(
  batcher: VaultBatcher,
  config: TimeUntilDispatchableQueryConfig = {},
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof vaultQueryKeys.timeUntilDispatchable.batch>
> {
  const queryOpts = config.query ?? {};
  // Read before the spread below, which strips `refetchInterval` from `queryOpts`.
  const refetchInterval =
    config.refetchInterval ?? (queryOpts.refetchInterval as number | undefined);

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.timeUntilDispatchable.batch(batcher.address, config.batchId),
    queryFn: async (context) => {
      const [, { batchId }] = context.queryKey;
      assertNonNullable(batchId, "timeUntilDispatchableQueryOptions: batchId");
      return batcher.timeUntilDispatchable(batchId);
    },
    refetchInterval,
    enabled: config.batchId !== undefined && queryOpts.enabled !== false,
  };
}
