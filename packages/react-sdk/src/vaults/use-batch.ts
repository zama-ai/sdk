"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import { batchQueryOptions, type Batch, type BatchRef } from "@zama-fhe/sdk/vaults";
import type { Address } from "viem";
import { useQuery } from "../utils/query";
import { useVaultClient } from "./use-vault-client";

/** TanStack Query options accepted by {@link useBatch}. */
export interface UseBatchOptions extends Omit<
  UseQueryOptions<Batch>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Read this account's deposit, and list `claim` and `quit` for it. */
  account?: Address;
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * One batch's state, timings, and the actions that can be sent for it now.
 * Refetches when `nextChangeAt` passes and polls while the batch settles, so
 * a UI needs no timer of its own.
 *
 * @param batch - The batch to read. The query stays disabled while `undefined`.
 *
 * @example
 * ```tsx
 * const { data: batch } = useBatch(ref, { account });
 * const claim = useClaim();
 * {batch?.actions.includes("claim") && <Button onClick={() => claim.mutate(ref)}>Claim</Button>}
 * ```
 */
export function useBatch(batch: BatchRef | undefined, options?: UseBatchOptions) {
  const { account, enabled = true, ...rest } = options ?? {};
  const baseOptions = batchQueryOptions(useVaultClient(), { batch, account });
  return useQuery<Batch>({
    ...baseOptions,
    ...rest,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
