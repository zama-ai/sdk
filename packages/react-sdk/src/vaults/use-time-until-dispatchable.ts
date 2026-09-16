"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { timeUntilDispatchableQueryOptions } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useTimeUntilDispatchable}. */
export interface UseTimeUntilDispatchableConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Batch to check. The query is disabled while `undefined`. */
  batchId: bigint | undefined;
  /**
   * Poll interval in milliseconds for a live countdown. Omit to fetch once —
   * the value doesn't change on its own once fetched.
   */
  refetchInterval?: number;
}

/**
 * Seconds until a batch becomes eligible for dispatch, `0` once it already is
 * — the earliest possible moment, not a promise anyone will dispatch then.
 * Measured against the chain's block timestamp, not the caller's wall clock.
 *
 * @param config - The batcher address, batch id, and optional poll interval.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: secondsLeft } = useTimeUntilDispatchable({
 *   address: "0xDepositBatcher",
 *   batchId,
 *   refetchInterval: 5_000,
 * });
 * ```
 */
export function useTimeUntilDispatchable(
  config: UseTimeUntilDispatchableConfig,
  options?: Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn">,
) {
  const batcher = useVaultBatcher(config.address);
  const baseOpts = timeUntilDispatchableQueryOptions(batcher, {
    batchId: config.batchId,
    refetchInterval: config.refetchInterval,
  });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
