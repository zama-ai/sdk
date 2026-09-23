"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterQuit,
  recoverMutationOptions,
  type RecoverParams,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useRecover}. */
export interface UseRecoverConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Refund a depositor's deposit in a canceled batch on their behalf.
 * Permissionless — anyone can call this, and the refund always goes to the
 * depositor, never to the caller. Invalidates the batcher's input token's
 * balance cache on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const recover = useRecover({ address: "0xDepositBatcher" });
 * recover.mutate({ batchId: 7n, account: "0xDepositor" });
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
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(batcher.sdk, "recover", batcher.fromToken(), (fromToken) =>
        invalidateAfterQuit(context.client, { batcherAddress: batcher.address, fromToken }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, RecoverParams, TContext>;
}
