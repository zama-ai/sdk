import {
  applyDecryptedValues,
  extractEncryptedHandles,
  parseActivityFeed,
  sortByBlockNumber,
  type ActivityItem,
  type ActivityLogMetadata,
} from "../activity";
import type { RawLog } from "../events/onchain-events";
import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { Hex } from "viem";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ActivityFeedConfig {
  userAddress?: Address;
  logs?: readonly (RawLog & Partial<ActivityLogMetadata>)[];
  decrypt?: boolean;
  logsKey?: string;
}

export interface ActivityFeedQueryConfig {
  query?: Record<string, unknown>;
}

/**
 * Build query options for a decrypted activity feed scoped to one render context.
 *
 * @remarks
 * - Closure deviation: this query function intentionally reads `logs` from
 *   closure state instead of reconstructing inputs from `context.queryKey`.
 * - External-key restriction: because `logs` are not encoded into the key
 *   payload, this factory is not compatible with `queryClient.fetchQuery`
 *   calls that only provide an externally-constructed key.
 * - Render-scope rationale: logs are derived in-component and intentionally
 *   kept out of cache identity to avoid query-key bloat for hook usage.
 */
export function activityFeedQueryOptions(
  token: ReadonlyToken,
  config: ActivityFeedConfig,
  queryConfig?: ActivityFeedQueryConfig,
): QueryFactoryOptions<
  ActivityItem[],
  Error,
  ActivityItem[],
  ReturnType<typeof zamaQueryKeys.activityFeed.scope>
> {
  const userAddress = config.userAddress ?? "";
  const logsKey = config.logsKey ?? "";
  const decrypt = config.decrypt ?? true;

  const queryKey = zamaQueryKeys.activityFeed.scope(token.address, userAddress, logsKey, decrypt);

  return {
    ...filterQueryOptions(queryConfig?.query ?? {}),
    queryKey,
    queryFn: async (_context: { queryKey: typeof queryKey }) => {
      if (!config.logs || !config.userAddress) return [];

      const parsed = parseActivityFeed(config.logs, config.userAddress);
      if (!decrypt) return sortByBlockNumber(parsed);

      const handles = extractEncryptedHandles(parsed) as Hex[];
      if (handles.length === 0) return sortByBlockNumber(parsed);

      const decrypted = await token.decryptHandles(handles, config.userAddress);
      return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
    },
    staleTime: Infinity,
    enabled: Boolean(config.userAddress && config.logs) && queryConfig?.query?.enabled !== false,
  };
}
