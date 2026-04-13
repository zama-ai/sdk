"use client";

import { useQuery } from "../utils/query";
import type { Address, RawLog, ActivityLogMetadata, ActivityItem } from "@zama-fhe/sdk";
import { activityFeedQueryOptions, deriveActivityFeedLogsKey } from "@zama-fhe/sdk/query";
import { useToken } from "../token/use-token";

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
export function useActivityFeed(config: UseActivityFeedConfig) {
  const { tokenAddress, userAddress, logs, decrypt: decryptOpt } = config;
  const token = useToken({ tokenAddress });
  const decrypt = decryptOpt ?? true;
  const logsKey = deriveActivityFeedLogsKey(logs);

  return useQuery<ActivityItem[]>(
    activityFeedQueryOptions(token, {
      userAddress,
      logs,
      decrypt,
      logsKey,
    }),
  );
}
