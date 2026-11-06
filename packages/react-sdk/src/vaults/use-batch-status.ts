"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { batchStatusQueryOptions, type BatchStatus } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useBatchStatus}. */
export interface UseBatchStatusConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Batch to read the status of. The query is disabled while `undefined`. */
  batchId: bigint | undefined;
  /** Chain to read from, when it is not the connected one. Needs a provider that can route reads, such as `WagmiProvider`. */
  chainId?: number;
}

/** TanStack Query options accepted by {@link useBatchStatus} (excluding `queryKey`/`queryFn`). */
export interface UseBatchStatusOptions extends Omit<
  UseQueryOptions<BatchStatus>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * A batch's state with the timestamps that state needs, in one read. Switch on
 * `data.state` to render every step of a deposit or redemption after it is
 * sent; an exhaustive switch makes TypeScript flag a state the UI forgets.
 *
 * @param config - The batcher address and batch id.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: status } = useBatchStatus(
 *   { address: "0xDepositBatcher", batchId },
 *   { refetchInterval: 10_000 },
 * );
 * switch (status?.state) {
 *   case BatchState.Pending: // offer quit, show status.secondsUntilDispatchable
 *   case BatchState.Dispatched: // wait; offer finalize if the keeper is late
 *   case BatchState.Finalized: // offer claim
 *   case BatchState.Canceled: // offer quit to take the deposit back
 * }
 * ```
 */
export function useBatchStatus(config: UseBatchStatusConfig, options?: UseBatchStatusOptions) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address, { chainId: config.chainId });
  const baseOptions = batchStatusQueryOptions(batcher, { batchId: config.batchId });

  return useQuery<BatchStatus>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
