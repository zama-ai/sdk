"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { timeUntilCallbackDeadlineQueryOptions } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useTimeUntilCallbackDeadline}. */
export interface UseTimeUntilCallbackDeadlineConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Batch to check. The query is disabled while `undefined`. */
  batchId: bigint | undefined;
}

/** TanStack Query options accepted by {@link useTimeUntilCallbackDeadline} (excluding `queryKey`/`queryFn`). */
export interface UseTimeUntilCallbackDeadlineOptions extends Omit<
  UseQueryOptions<bigint | null>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Seconds until a dispatched batch reaches its callback deadline, `0` once it
 * has: from then on `useFinalize` cancels the batch instead of settling it.
 * Measured against the chain's block timestamp, not the caller's wall clock.
 *
 * `null` outside `Dispatched`, where there is nothing to finalize.
 *
 * @param config - The batcher address and batch id.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: secondsLeft } = useTimeUntilCallbackDeadline(
 *   { address: "0xDepositBatcher", batchId },
 *   { refetchInterval: 5_000 },
 * );
 * const canFinalize = secondsLeft !== null && secondsLeft !== undefined;
 * ```
 */
export function useTimeUntilCallbackDeadline(
  config: UseTimeUntilCallbackDeadlineConfig,
  options?: UseTimeUntilCallbackDeadlineOptions,
) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address);
  const baseOptions = timeUntilCallbackDeadlineQueryOptions(batcher, { batchId: config.batchId });

  return useQuery<bigint | null>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
