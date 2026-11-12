import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link pausedQueryOptions}. */
export interface PausedQueryConfig {
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Query options for whether a batcher is paused — see {@link VaultBatcher.paused}. */
export function pausedQueryOptions(
  batcher: VaultBatcher,
  config: PausedQueryConfig = {},
): QueryFactoryOptions<boolean, Error, boolean, ReturnType<typeof vaultQueryKeys.paused.batcher>> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.paused.batcher(batcher.address, batcher.chainId),
    queryFn: async () => batcher.paused(),
    enabled: queryOpts.enabled !== false,
  };
}
