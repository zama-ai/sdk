"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  Address,
  RawLog,
  ActivityLogMetadata,
  ActivityItem,
} from "@zama-fhe/token-sdk";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/token-sdk";
import { useReadonlyConfidentialToken } from "./use-readonly-confidential-token";

export const activityFeedQueryKeys = {
  all: ["activityFeed"] as const,
  token: (tokenAddress: string) => ["activityFeed", tokenAddress] as const,
} as const;

interface UseActivityFeedOptions {
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
  tokenAddress: Address,
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[] | undefined,
  userAddress: Address | undefined,
  options?: UseActivityFeedOptions,
): UseQueryResult<ActivityItem[], Error> {
  const token = useReadonlyConfidentialToken(tokenAddress);
  const decrypt = options?.decrypt ?? true;
  const enabled = logs !== undefined && userAddress !== undefined;

  return useQuery<ActivityItem[], Error>({
    queryKey: [
      ...activityFeedQueryKeys.token(tokenAddress),
      userAddress ?? "",
      logs?.length ?? 0,
    ],
    queryFn: async () => {
      if (!logs || !userAddress) return [];

      // Phase 1: Parse and classify (sync)
      const items = sortByBlockNumber(parseActivityFeed(logs, userAddress));

      if (!decrypt) return items;

      // Phase 2: Batch decrypt encrypted handles
      const handles = extractEncryptedHandles(items);
      if (handles.length === 0) return items;

      const decryptedMap = await token.decryptHandles(
        handles as Address[],
        userAddress,
      );

      return applyDecryptedValues(items, decryptedMap);
    },
    enabled: enabled,
    staleTime: Infinity,
  });
}
