"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Hex, RawLog, ActivityLogMetadata, ActivityItem } from "@zama-fhe/token-sdk";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export const activityFeedQueryKeys = {
  all: ["activityFeed"] as const,
  token: (tokenAddress: string) => ["activityFeed", tokenAddress] as const,
} as const;

export interface UseActivityFeedConfig {
  tokenAddress: Hex;
  userAddress: Hex | undefined;
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[] | undefined;
  /** Whether to batch-decrypt encrypted transfer amounts. Default: true */
  decrypt?: boolean;
}

/**
 * Two-phase activity feed hook.
 * Phase 1: Instantly parses raw logs into classified ActivityItems (sync, cheap).
 * Phase 2: Batch-decrypts encrypted transfer amounts via the relayer (async).
 *
 * The wallet provides logs (from its own provider — viem, ethers, etc.)
 * and this hook normalizes + decrypts them.
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
      logs?.length ?? 0,
      logs?.[0]?.blockNumber ?? 0,
      logs?.[logs.length - 1]?.blockNumber ?? 0,
    ],
    queryFn: async () => {
      if (!logs || !userAddress) return [];

      // Phase 1: Parse and classify (sync)
      const items = sortByBlockNumber(parseActivityFeed(logs, userAddress));

      if (!decrypt) return items;

      // Phase 2: Batch decrypt encrypted handles
      const handles = extractEncryptedHandles(items);
      if (handles.length === 0) return items;

      const decryptedMap = await token.decryptHandles(handles as Hex[], userAddress);

      return applyDecryptedValues(items, decryptedMap);
    },
    enabled: enabled,
    staleTime: Infinity,
  });
}
