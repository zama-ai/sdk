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

import { assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions, hashFn } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

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
 * Derive a stable cache identity for a set of raw logs.
 *
 * @remarks
 * Callers may pass an explicit `logsKey` when they already have a stable cache
 * identity. When omitted, this helper hashes the raw log contents plus optional
 * metadata so distinct log sets do not alias to the same query entry.
 */
export function deriveActivityFeedLogsKey(
  logs?: readonly (RawLog & Partial<ActivityLogMetadata>)[],
): string | undefined {
  if (!logs) {
    return undefined;
  }

  return hashFn([
    "zama.activityFeed.logs",
    logs.map((log) => ({
      topics: [...log.topics],
      data: log.data,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    })),
  ]);
}

/**
 * Build query options for a decrypted activity feed scoped to one render context.
 *
 * @remarks
 * `logs` are read from closure, not from `context.queryKey`, to avoid
 * serializing potentially large log arrays into the cache key. The `logsKey`
 * field provides stable cache identity instead.
 *
 * Because `logs` are not encoded into the key, this factory is not compatible
 * with `queryClient.fetchQuery` calls that only provide an externally-constructed key.
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
  const userAddress = config.userAddress;
  const decrypt = config.decrypt ?? true;
  const logs = config.logs;
  const logsKey = config.logsKey ?? deriveActivityFeedLogsKey(logs);
  const queryEnabled = queryConfig?.query?.enabled !== false;

  const queryKey = zamaQueryKeys.activityFeed.scope(token.address, userAddress, logsKey, decrypt);

  return {
    ...filterQueryOptions(queryConfig?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { userAddress: keyUserAddress, decrypt: keyDecrypt }] = context.queryKey;
      assertNonNullable(keyUserAddress, "activityFeedQueryOptions: userAddress");
      assertNonNullable(logs, "activityFeedQueryOptions: logs");

      const parsed = parseActivityFeed(logs, keyUserAddress);
      if (!keyDecrypt) {
        return sortByBlockNumber(parsed);
      }

      const handles = extractEncryptedHandles(parsed);
      if (handles.length === 0) {
        return sortByBlockNumber(parsed);
      }

      const decrypted = await token.decryptHandles(handles, keyUserAddress);
      return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
    },
    staleTime: Infinity,
    enabled: Boolean(userAddress && logs) && queryEnabled,
  };
}
