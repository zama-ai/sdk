"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import { quitMutationOptions, type QuitParams } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useQuit}. */
export interface UseQuitConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Undo the caller's own join before a batch is dispatched, returning the
 * joined amount to their balance. Invalidates the batcher's input token's
 * balance cache on success.
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
    onSuccess: async (data, variables, onMutateResult, context) => {
      const fromToken = await batcher.fromToken();
      invalidateBalanceQueries(context.client, fromToken);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, QuitParams, TContext>;
}
