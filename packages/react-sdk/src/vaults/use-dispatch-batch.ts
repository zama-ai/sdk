"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { dispatchBatchMutationOptions, invalidateAfterDispatchBatch } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useDispatchBatch}. */
export interface UseDispatchBatchConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Close the current batch once it is old enough and kick off decryption of its
 * aggregate amount. Permissionless — any connected account can call this, not
 * just participants. Invalidates the batcher's cached batch state on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const dispatchBatch = useDispatchBatch({ address: "0xDepositBatcher" });
 * dispatchBatch.mutate();
 * ```
 */
export function useDispatchBatch<TContext = unknown>(
  config: UseDispatchBatchConfig,
  options?: UseMutationOptions<TransactionResult, Error, void, TContext>,
): UseMutationResult<TransactionResult, Error, void, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...dispatchBatchMutationOptions(batcher),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateAfterDispatchBatch(context.client, batcher.address);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, void, TContext>;
}
