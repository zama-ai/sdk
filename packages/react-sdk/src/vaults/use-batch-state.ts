"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { batchStateQueryOptions, type BatchState } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useBatchState}. */
export interface UseBatchStateConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Batch to read the state of. The query is disabled while `undefined`. */
  batchId: bigint | undefined;
}

/** TanStack Query options accepted by {@link useBatchState} (excluding `queryKey`/`queryFn`). */
export interface UseBatchStateOptions extends Omit<
  UseQueryOptions<BatchState>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * A batch's lifecycle state, which decides what the user may do next — see
 * {@link BatchState}. Claiming is possible only on `Finalized`; `Canceled`
 * means the batch never executed and the deposit must be quit instead.
 *
 * @param config - The batcher address and batch id.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: state } = useBatchState({ address: "0xDepositBatcher", batchId });
 * ```
 */
export function useBatchState(config: UseBatchStateConfig, options?: UseBatchStateOptions) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address);
  const baseOptions = batchStateQueryOptions(batcher, { batchId: config.batchId });

  return useQuery<BatchState>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
