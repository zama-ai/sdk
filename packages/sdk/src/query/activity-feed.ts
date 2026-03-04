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

export function activityFeedQueryOptions(
  token: ReadonlyToken,
  config: ActivityFeedConfig,
  queryConfig?: ActivityFeedQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.activityFeed.scope>, ActivityItem[]> {
  const userAddress = config.userAddress ?? "";
  const logsKey = config.logsKey ?? "";
  const decrypt = config.decrypt ?? true;

  const queryKey = zamaQueryKeys.activityFeed.scope(token.address, userAddress, logsKey, decrypt);

  return {
    ...filterQueryOptions(queryConfig?.query ?? {}),
    queryKey,
    queryFn: async () => {
      if (!config.logs || !config.userAddress) return [];

      const parsed = parseActivityFeed(config.logs, config.userAddress);
      if (!decrypt) return sortByBlockNumber(parsed);

      const handles = extractEncryptedHandles(parsed) as Address[];
      if (handles.length === 0) return sortByBlockNumber(parsed);

      const decrypted = await token.decryptHandles(handles, config.userAddress);
      return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
    },
    staleTime: Infinity,
    enabled: Boolean(config.userAddress && config.logs) && queryConfig?.query?.enabled !== false,
  };
}
