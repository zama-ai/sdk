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
}

/** TanStack Query options accepted by {@link useTimeUntilDispatchable} (excluding `queryKey`/`queryFn`). */
export interface UseTimeUntilDispatchableOptions extends Omit<
  UseQueryOptions<bigint | null>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Seconds until a batch becomes eligible for dispatch, `0` once it already is
 * — the earliest possible moment, not a promise anyone will dispatch then.
 * Measured against the chain's block timestamp, not the caller's wall clock.
 *
 * `null` once the batch has left `Pending` and can never be dispatched again.
 *
 * @param config - The batcher address and batch id.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: secondsLeft } = useTimeUntilDispatchable(
 *   { address: "0xDepositBatcher", batchId },
 *   { refetchInterval: 5_000 },
 * );
 * ```
 */
export function useTimeUntilDispatchable(
  config: UseTimeUntilDispatchableConfig,
  options?: UseTimeUntilDispatchableOptions,
) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address);
  const baseOptions = timeUntilDispatchableQueryOptions(batcher, { batchId: config.batchId });

  return useQuery<bigint | null>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
