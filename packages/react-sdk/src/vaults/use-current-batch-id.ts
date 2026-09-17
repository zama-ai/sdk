"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { currentBatchIdQueryOptions } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useCurrentBatchId}. */
export interface UseCurrentBatchIdConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/** TanStack Query options accepted by {@link useCurrentBatchId} (excluding `queryKey`/`queryFn`). */
export interface UseCurrentBatchIdOptions extends Omit<
  UseQueryOptions<bigint>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * The id of a batcher's currently open (not-yet-dispatched) batch.
 *
 * @param config - The batcher address.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: batchId } = useCurrentBatchId({ address: "0xDepositBatcher" });
 * ```
 */
export function useCurrentBatchId(
  config: UseCurrentBatchIdConfig,
  options?: UseCurrentBatchIdOptions,
) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address);
  const baseOptions = currentBatchIdQueryOptions(batcher);

  return useQuery<bigint>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
