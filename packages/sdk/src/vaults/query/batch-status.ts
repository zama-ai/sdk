import { assertNonNullable } from "../../utils/assertions";
import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import type { BatchStatus } from "../types";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link batchStatusQueryOptions}. */
export interface BatchStatusQueryConfig {
  /** Batch to read the status of; the query stays disabled until provided. */
  batchId?: bigint;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Query options for a batch's state and timestamps — see {@link VaultBatcher.batchStatus}. */
export function batchStatusQueryOptions(
  batcher: VaultBatcher,
  config: BatchStatusQueryConfig = {},
): QueryFactoryOptions<
  BatchStatus,
  Error,
  BatchStatus,
  ReturnType<typeof vaultQueryKeys.batchStatus.batch>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.batchStatus.batch(batcher.address, config.batchId),
    queryFn: async (context) => {
      const [, { batchId }] = context.queryKey;
      assertNonNullable(batchId, "batchStatusQueryOptions: batchId");
      return batcher.batchStatus(batchId);
    },
    enabled: config.batchId !== undefined && queryOpts.enabled !== false,
  };
}
