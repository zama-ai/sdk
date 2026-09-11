import { assertNonNullable } from "../../utils/assertions";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link batchStateQueryOptions}. */
export interface BatchStateQueryConfig {
  /** Batch to read the state of; the query stays disabled until provided. */
  batchId?: bigint;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for a batch's lifecycle state, as the raw number the
 * contract stores — see {@link VaultBatcher.batchState}.
 */
export function batchStateQueryOptions(
  batcher: VaultBatcher,
  config: BatchStateQueryConfig = {},
): QueryFactoryOptions<number, Error, number, ReturnType<typeof vaultQueryKeys.batchState.batch>> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.batchState.batch(batcher.address, config.batchId),
    queryFn: async (context) => {
      const [, { batchId }] = context.queryKey;
      assertNonNullable(batchId, "batchStateQueryOptions: batchId");
      return batcher.batchState(batchId);
    },
    enabled: config.batchId !== undefined && queryOpts.enabled !== false,
  };
}
