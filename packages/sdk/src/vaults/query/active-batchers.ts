import type { Address } from "viem";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { BatcherDirection } from "../batcher-history";
import type { VaultGroup } from "../vault-group";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link activeBatchersQueryOptions}. */
export interface ActiveBatchersQueryConfig {
  /** Which side of the group to read — the deposit or the redeem batchers. */
  direction: BatcherDirection;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for the batcher every member of a group would currently join,
 * keyed by member id.
 */
export function activeBatchersQueryOptions(
  group: VaultGroup,
  config: ActiveBatchersQueryConfig,
): QueryFactoryOptions<
  Readonly<Record<string, Address>>,
  Error,
  Readonly<Record<string, Address>>,
  ReturnType<typeof vaultQueryKeys.activeBatchers.group>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.activeBatchers.group(group.id, config.direction),
    queryFn: async () => group.activeBatchers(config.direction),
    enabled: queryOpts.enabled !== false,
  };
}
