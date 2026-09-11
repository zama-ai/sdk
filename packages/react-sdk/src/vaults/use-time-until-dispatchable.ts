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
 * Seconds remaining until a batch reaches its minimum age and becomes
 * eligible for dispatch — `0` once it already is. Computed against the
 * chain's current block timestamp, not the caller's wall clock.
 *
 * Not a guarantee dispatch will succeed the moment this reaches `0` —
 * someone still has to submit the transaction.
 *
 * @param config - The batcher address, batch id, and optional poll interval.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (seconds remaining).
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
