import type { QueryFactoryOptions } from "../../query/factory-types";
import { filterQueryOptions } from "../../query/utils";
import { assertNonNullable } from "../../utils/assertions";
import type { VaultBatcher } from "../vault-batcher";
import { vaultQueryKeys } from "./query-keys";

/** Configuration for {@link timeUntilCallbackDeadlineQueryOptions}. */
export interface TimeUntilCallbackDeadlineQueryConfig {
  /** Batch to check; the query stays disabled until provided. */
  batchId?: bigint;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/**
 * Query options for the seconds remaining until a dispatched batch reaches
 * its callback deadline, or `null` outside `Dispatched` — see
 * {@link VaultBatcher.timeUntilCallbackDeadline}.
 */
export function timeUntilCallbackDeadlineQueryOptions(
  batcher: VaultBatcher,
  config: TimeUntilCallbackDeadlineQueryConfig = {},
): QueryFactoryOptions<
  bigint | null,
  Error,
  bigint | null,
  ReturnType<typeof vaultQueryKeys.timeUntilCallbackDeadline.batch>
> {
  const queryOpts = config.query ?? {};

  return {
    ...filterQueryOptions(queryOpts),
    queryKey: vaultQueryKeys.timeUntilCallbackDeadline.batch(batcher.address, config.batchId),
    queryFn: async (context) => {
      const [, { batchId }] = context.queryKey;
      assertNonNullable(batchId, "timeUntilCallbackDeadlineQueryOptions: batchId");
      return batcher.timeUntilCallbackDeadline(batchId);
    },
    enabled: config.batchId !== undefined && queryOpts.enabled !== false,
  };
}
