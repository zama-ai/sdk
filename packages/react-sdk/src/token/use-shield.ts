"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterShield,
  shieldMutationOptions,
  type ShieldParams,
} from "@zama-fhe/sdk/query";
import {
  applyOptimisticBalanceDelta,
  type OptimisticMutateContext,
  rollbackOptimisticBalanceDelta,
  unwrapOptimisticCallerContext,
} from "./optimistic-balance-update";
import { useToken, type UseZamaConfig } from "./use-token";

/** Configuration for {@link useShield}. */
export interface UseShieldConfig extends UseZamaConfig {
  /**
   * When `true`, optimistically adds the wrap amount to the cached confidential balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Shield public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically. Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link ApprovalFailedError} — ERC-20 approval transaction failed
 * - {@link TransactionRevertedError} — shield transaction reverted
 *
 * @param config - Token and wrapper addresses.
 *   Set `optimistic: true` to add the amount to the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shield = useShield({ tokenAddress: "0x...", wrapperAddress: "0x...", optimistic: true });
 * shield.mutate({ amount: 1000n });
 * ```
 */
export function useShield(
  config: UseShieldConfig,
  options?: UseMutationOptions<TransactionResult, Error, ShieldParams, OptimisticMutateContext>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<TransactionResult, Error, ShieldParams, OptimisticMutateContext>({
    ...shieldMutationOptions(token),
    ...options,
    onMutate: config.optimistic
      ? async (variables, mutationContext) => {
          const snapshot = await applyOptimisticBalanceDelta(
            queryClient,
            config.tokenAddress,
            variables.amount,
            "add",
          );
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
      // callerContext is the user's original onMutate return — cast required by wrapper pattern
      options?.onError?.(
        error,
        variables,
        callerContext as OptimisticMutateContext | undefined,
        context,
      );
    },
    onSuccess: (data, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
      options?.onSuccess?.(data, variables, callerContext as OptimisticMutateContext, context);
      invalidateAfterShield(context.client, config.tokenAddress);
    },
    onSettled: (data, error, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
      options?.onSettled?.(
        data,
        error,
        variables,
        callerContext as OptimisticMutateContext | undefined,
        context,
      );
    },
  });
}
