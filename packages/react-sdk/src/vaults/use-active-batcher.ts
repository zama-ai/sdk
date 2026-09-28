"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { activeBatcherQueryOptions, type BatcherHistory } from "@zama-fhe/sdk/vaults";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

/** Configuration for {@link useActiveBatcher}. */
export interface UseActiveBatcherConfig {
  /** The vault's batcher history for one direction. */
  history: BatcherHistory;
}

/** TanStack Query options accepted by {@link useActiveBatcher} (excluding `queryKey`/`queryFn`). */
export interface UseActiveBatcherOptions extends Omit<
  UseQueryOptions<Address>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * The batcher a join would reach right now.
 *
 * @param config - The vault's batcher history for one direction.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @remarks
 * Pass a `refetchInterval` on a screen that stays open: nothing client-side
 * predicts when this flips.
 *
 * @example
 * ```tsx
 * const { data: batcher } = useActiveBatcher({ history: vault.batchers.deposit });
 * ```
 */
export function useActiveBatcher(
  config: UseActiveBatcherConfig,
  options?: UseActiveBatcherOptions,
) {
  const { enabled = true } = options ?? {};
  const sdk = useZamaSDK();
  const baseOptions = activeBatcherQueryOptions(sdk, { history: config.history });

  return useQuery<Address>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
