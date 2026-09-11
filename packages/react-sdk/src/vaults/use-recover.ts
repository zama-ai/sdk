"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import { recoverMutationOptions, type RecoverParams } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useRecover}. */
export interface UseRecoverConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Recover funds after a batch was canceled — for example, it failed to
 * finalize within its callback deadline. The batch never executed, so this
 * refunds the original input token rather than delivering a converted
 * output the way `useClaim` does. Permissionless otherwise (anyone can call
 * it on another account's behalf; the output always goes to that account).
 * Invalidates the batcher's input token's balance cache on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const recover = useRecover({ address: "0xDepositBatcher" });
 * recover.mutate({ batchId: 7n });
 * ```
 */
export function useRecover<TContext = unknown>(
  config: UseRecoverConfig,
  options?: UseMutationOptions<TransactionResult, Error, RecoverParams, TContext>,
): UseMutationResult<TransactionResult, Error, RecoverParams, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...recoverMutationOptions(batcher),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const fromToken = await batcher.fromToken();
      invalidateBalanceQueries(context.client, fromToken);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, RecoverParams, TContext>;
}
