import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link currentBatchIdQueryOptions}. */
export interface CurrentBatchIdQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Query options for a batcher's currently open batch id. */
export function currentBatchIdQueryOptions(
  batcher: VaultBatcher,
  config: CurrentBatchIdQueryConfig = {},
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof vaultQueryKeys.currentBatchId.batcher>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.currentBatchId.batcher(batcher.address),
    queryFn: async () => batcher.currentBatchId(),
    enabled: queryOpts.enabled !== false,
  };
}
