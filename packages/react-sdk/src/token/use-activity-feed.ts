"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address, RawLog, ActivityLogMetadata, ActivityItem, Handle } from "@zama-fhe/sdk";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";
import { useReadonlyToken } from "./use-readonly-token";

/**
 * Query key factory for activity feed queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const activityFeedQueryKeys = {
  /** Match all activity feed queries. */
  all: ["activityFeed"] as const,
  /** Match activity feed queries for a specific token. */
  token: (tokenAddress: string) => ["activityFeed", tokenAddress] as const,
} as const;

/** Configuration for {@link useActivityFeed}. */
export interface UseActivityFeedConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Connected wallet address. Pass `undefined` to disable the query. */
  userAddress: Address | undefined;
  /** Raw event logs from the provider (viem, ethers, etc.). Pass `undefined` to disable. */
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[] | undefined;
  /** Whether to batch-decrypt encrypted transfer amounts. Default: `true`. */
  decrypt?: boolean;
}

/**
 * Two-phase activity feed hook.
 * Phase 1: Instantly parses raw logs into classified {@link ActivityItem}s (sync, cheap).
 * Phase 2: Batch-decrypts encrypted transfer amounts via the relayer (async).
 *
 * The wallet provides logs (from its own provider — viem, ethers, etc.)
 * and this hook normalizes + decrypts them.
 *
 * @param config - Token address, user address, raw logs, and decrypt option.
 * @returns Query result with `data: ActivityItem[]`.
 *
 * @example
 * ```tsx
 * const { data: activity } = useActivityFeed({
 *   tokenAddress: "0xToken",
 *   userAddress: "0xUser",
 *   logs: rawLogs,
 * });
 * ```
 */
export function useActivityFeed(
  config: UseActivityFeedConfig,
): UseQueryResult<ActivityItem[], Error> {
  const { tokenAddress, userAddress, logs, decrypt: decryptOpt } = config;
  const token = useReadonlyToken(tokenAddress);
  const decrypt = decryptOpt ?? true;
  const enabled = logs !== undefined && userAddress !== undefined;

  return useQuery<ActivityItem[], Error>({
    queryKey: [
      ...activityFeedQueryKeys.token(tokenAddress),
      userAddress ?? "",
      logs?.map((l) => `${l.transactionHash ?? ""}:${l.logIndex ?? ""}`).join(",") ?? "",
    ],
    queryFn: async () => {
      if (!logs || !userAddress) return [];

      // Phase 1: Parse and classify (sync)
      const items = sortByBlockNumber(parseActivityFeed(logs, userAddress));

      if (!decrypt) return items;

      // Phase 2: Batch decrypt encrypted handles
      const handles = extractEncryptedHandles(items);
      if (handles.length === 0) return items;

      const decryptedMap = await token.decryptHandles(handles, userAddress);

      return applyDecryptedValues(items, decryptedMap);
    },
    enabled: enabled,
    staleTime: Infinity,
  });
}
