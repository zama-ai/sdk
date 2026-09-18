"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateAfterQuit, quitMutationOptions, type QuitParams } from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useQuit}. */
export interface UseQuitConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Return the caller's own deposit to their balance. Works on a batch that is
 * still pending, and on one that was canceled. To refund someone else's
 * deposit in a canceled batch, use `useRecover`. Invalidates the batcher's
 * input token's balance cache on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const quit = useQuit({ address: "0xDepositBatcher" });
 * quit.mutate({ batchId: 7n });
 * ```
 */
export function useQuit<TContext = unknown>(
  config: UseQuitConfig,
  options?: UseMutationOptions<TransactionResult, Error, QuitParams, TContext>,
): UseMutationResult<TransactionResult, Error, QuitParams, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...quitMutationOptions(batcher),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(batcher.sdk, "quit", batcher.fromToken(), (fromToken) =>
        invalidateAfterQuit(context.client, { batcherAddress: batcher.address, fromToken }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, QuitParams, TContext>;
}
