"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { batchStateQueryOptions } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useBatchState}. */
export interface UseBatchStateConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Batch to read the state of. The query is disabled while `undefined`. */
  batchId: bigint | undefined;
}

/**
 * A batch's lifecycle state, as the raw number the contract stores.
 *
 * This SDK does not yet mirror the batcher contract's `BatchState` enum by
 * name — compare the returned value against that enum's definition for
 * anything beyond the two states observed directly: batches that are still
 * open (accepting joins) read `0`; every already-settled batch sampled read `3`.
 *
 * @param config - The batcher address and batch id.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: number`.
 *
 * @example
 * ```tsx
 * const { data: state } = useBatchState({ address: "0xDepositBatcher", batchId });
 * ```
 */
export function useBatchState(
  config: UseBatchStateConfig,
  options?: Omit<UseQueryOptions<number>, "queryKey" | "queryFn">,
) {
  const batcher = useVaultBatcher(config.address);
  const baseOpts = batchStateQueryOptions(batcher, { batchId: config.batchId });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
