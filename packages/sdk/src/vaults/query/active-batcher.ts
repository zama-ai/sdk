import type { Address } from "viem";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { ZamaSDK } from "../../zama-sdk";
import { resolveActiveBatcher, type BatcherHistory } from "../batcher-history";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link activeBatcherQueryOptions}. */
export interface ActiveBatcherQueryConfig {
  history: BatcherHistory;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for the batcher a new join currently reaches.
 *
 * Nothing client-side predicts when this flips, so a caller holding it across a
 * session should poll or invalidate rather than treat it as static.
 */
export function activeBatcherQueryOptions(
  sdk: ZamaSDK,
  config: ActiveBatcherQueryConfig,
): QueryFactoryOptions<
  Address,
  Error,
  Address,
  ReturnType<typeof vaultQueryKeys.activeBatcher.history>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.activeBatcher.history(config.history),
    queryFn: async () => resolveActiveBatcher(sdk, config.history),
    enabled: queryOpts.enabled !== false,
  };
}
