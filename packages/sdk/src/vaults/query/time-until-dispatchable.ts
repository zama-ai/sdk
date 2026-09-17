import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import { assertNonNullable } from "../../utils/assertions";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link timeUntilDispatchableQueryOptions}. */
export interface TimeUntilDispatchableQueryConfig {
  /** Batch to check; the query stays disabled until provided. */
  batchId?: bigint;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for the seconds remaining until a batch can be dispatched, or
 * `null` once the batch has left `Pending` and can no longer be dispatched —
 * see {@link VaultBatcher.timeUntilDispatchable}.
 */
export function timeUntilDispatchableQueryOptions(
  batcher: VaultBatcher,
  config: TimeUntilDispatchableQueryConfig = {},
): QueryFactoryOptions<
  bigint | null,
  Error,
  bigint | null,
  ReturnType<typeof vaultQueryKeys.timeUntilDispatchable.batch>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.timeUntilDispatchable.batch(batcher.address, config.batchId),
    queryFn: async (context) => {
      const [, { batchId }] = context.queryKey;
      assertNonNullable(batchId, "timeUntilDispatchableQueryOptions: batchId");
      return batcher.timeUntilDispatchable(batchId);
    },
    enabled: config.batchId !== undefined && queryOpts.enabled !== false,
  };
}
