"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";
import type { Address, RawLog, Handle } from "@zama-fhe/react-sdk";
import { useReadonlyToken } from "@zama-fhe/react-sdk";
import type { Hex } from "viem";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityItem,
  type ActivityLogMetadata,
} from "./activity";

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
 */
export function useActivityFeed(config: UseActivityFeedConfig): UseQueryResult<ActivityItem[]> {
  const { tokenAddress, userAddress, logs, decrypt: decryptOpt } = config;
  const token = useReadonlyToken(tokenAddress);
  const decrypt = decryptOpt ?? true;
  const logsKey =
    logs?.map((log) => `${log.transactionHash ?? ""}:${log.logIndex ?? ""}`).join(",") ?? "";

  return useQuery<ActivityItem[]>({
    queryKey: ["activityFeed", { tokenAddress, userAddress, logsKey, decrypt }],
    queryKeyHashFn: hashFn,
    queryFn: async () => {
      if (!logs || !userAddress) return [];

      const parsed = parseActivityFeed(logs, userAddress);
      if (!decrypt) return sortByBlockNumber(parsed);

      const handles = extractEncryptedHandles(parsed) as Hex[];
      if (handles.length === 0) return sortByBlockNumber(parsed);

      const decrypted = await token.decryptHandles(handles, userAddress);
      return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
    },
    staleTime: Infinity,
    enabled: Boolean(userAddress && logs),
  });
}
