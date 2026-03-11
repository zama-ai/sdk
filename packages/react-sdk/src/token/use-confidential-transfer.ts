"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferMutationOptions,
  invalidateAfterTransfer,
  type ConfidentialTransferParams,
} from "@zama-fhe/sdk/query";
import {
  applyOptimisticBalanceDelta,
  type OptimisticMutateContext,
  rollbackOptimisticBalanceDelta,
  unwrapOptimisticCallerContext,
} from "./optimistic-balance-update";
import { useToken, type UseZamaConfig } from "./use-token";

/** Configuration for {@link useConfidentialTransfer}. */
export interface UseConfidentialTransferConfig extends UseZamaConfig {
  /**
   * When `true`, optimistically subtracts the transfer amount from cached balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Encrypt and send a confidential transfer. Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 *   Set `optimistic: true` to subtract the amount from the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transfer = useConfidentialTransfer({
 *   tokenAddress: "0x...",
 *   optimistic: true,
 * });
 * transfer.mutate(
 *   { to: "0xRecipient", amount: 1000n },
 *   {
 *     onError: (error) => {
 *       if (error instanceof SigningRejectedError) {
 *         // user cancelled — no action needed
 *       }
 *     },
 *   },
 * );
 * ```
 */
export function useConfidentialTransfer(
  config: UseConfidentialTransferConfig,
  // Context type is OptimisticMutateContext because our onMutate wraps the caller's
  // context inside { snapshot, callerContext }. Caller callbacks receive the unwrapped callerContext.
  options?: UseMutationOptions<
    TransactionResult,
    Error,
    ConfidentialTransferParams,
    OptimisticMutateContext
  >,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<TransactionResult, Error, ConfidentialTransferParams, OptimisticMutateContext>(
    {
      ...confidentialTransferMutationOptions(token),
      ...options,
      onMutate: config.optimistic
        ? async (variables, mutationContext) => {
            const snapshot = await applyOptimisticBalanceDelta({
              queryClient,
              tokenAddress: config.tokenAddress,
              amount: variables.amount,
              mode: "subtract",
            });
            const callerContext = await options?.onMutate?.(variables, mutationContext);
            return { snapshot, callerContext };
          }
        : options?.onMutate,
      onError: (error, variables, rawContext, context) => {
        const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(
          config.optimistic,
          rawContext,
        );
        if (wrappedContext) {
          rollbackOptimisticBalanceDelta(queryClient, wrappedContext.snapshot);
        }
        options?.onError?.(error, variables, callerContext, context);
      },
      onSuccess: (data, variables, rawContext, context) => {
        const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
        options?.onSuccess?.(data, variables, callerContext!, context);
        invalidateAfterTransfer(context.client, config.tokenAddress);
      },
      onSettled: (data, error, variables, rawContext, context) => {
        const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
        options?.onSettled?.(data, error, variables, callerContext, context);
      },
    },
  );
}
