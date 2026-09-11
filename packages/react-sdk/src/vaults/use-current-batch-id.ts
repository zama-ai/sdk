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

/**
 * The id of a batcher's currently open (not-yet-dispatched) batch.
 *
 * @param config - The batcher address.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint`.
 *
 * @example
 * ```tsx
 * const { data: batchId } = useCurrentBatchId({ address: "0xDepositBatcher" });
 * ```
 */
export function useCurrentBatchId(
  config: UseCurrentBatchIdConfig,
  options?: Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn">,
) {
  const batcher = useVaultBatcher(config.address);
  const baseOpts = currentBatchIdQueryOptions(batcher);

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
