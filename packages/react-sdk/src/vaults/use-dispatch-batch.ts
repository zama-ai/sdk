"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { dispatchBatchMutationOptions, vaultQueryKeys } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useDispatchBatch}. */
export interface UseDispatchBatchConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Close the current batch once it has reached `minBatchAge` and kick off
 * decryption of its aggregate amount. Permissionless — any connected account
 * can call this, not just participants. Invalidates the batcher's
 * `currentBatchId`, `batchState`, and `timeUntilDispatchable` caches on
 * success, since dispatching advances the current batch and changes state
 * for the one just closed.
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
      void context.client.invalidateQueries({
        queryKey: vaultQueryKeys.currentBatchId.batcher(batcher.address),
      });
      void context.client.invalidateQueries({
        queryKey: vaultQueryKeys.batchState.batcher(batcher.address),
      });
      void context.client.invalidateQueries({
        queryKey: vaultQueryKeys.timeUntilDispatchable.batcher(batcher.address),
      });
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, void, TContext>;
}
