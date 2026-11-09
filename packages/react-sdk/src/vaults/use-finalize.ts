"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  finalizeMutationOptions,
  invalidateAfterFinalize,
  type FinalizeParams,
} from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useFinalize}. */
export interface UseFinalizeConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Chain the batcher is on. A wallet on another chain then gets `ChainMismatchError` instead of sending there. */
  chainId?: number;
}

/**
 * Settle a dispatched batch yourself when its keeper has not: publicly
 * decrypts the batch's aggregate amount and hands it to the batcher, which
 * executes the route. Permissionless. Past the batch's callback deadline the
 * same call cancels the batch instead. Invalidates the batcher's cached batch
 * state on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const finalize = useFinalize({ address: "0xDepositBatcher" });
 * finalize.mutate({ batchId });
 * ```
 */
export function useFinalize<TContext = unknown>(
  config: UseFinalizeConfig,
  options?: UseMutationOptions<TransactionResult, Error, FinalizeParams, TContext>,
): UseMutationResult<TransactionResult, Error, FinalizeParams, TContext> {
  const batcher = useVaultBatcher(config.address, { chainId: config.chainId });

  return useMutation({
    ...finalizeMutationOptions(batcher),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateAfterFinalize(context.client, batcher.address);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, FinalizeParams, TContext>;
}
