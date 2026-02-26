"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { useToken, type UseZamaConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useShield}. */
export interface ShieldParams {
  /** Amount of underlying ERC-20 tokens to wrap. */
  amount: bigint;
  /** Optional fee amount (for native ETH wrapping with fees). */
  fees?: bigint;
  /** ERC-20 approval strategy: `"exact"` (default), `"max"`, or `"skip"`. */
  approvalStrategy?: "max" | "exact" | "skip";
}

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
 * TanStack Query mutation options factory for shield.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function shieldMutationOptions(token: Token) {
  return {
    mutationKey: ["shield", token.address] as const,
    mutationFn: async ({ amount, fees, approvalStrategy }: ShieldParams) =>
      token.shield(amount, { fees, approvalStrategy }),
  };
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
  options?: UseMutationOptions<TransactionResult, Error, ShieldParams, Address>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<TransactionResult, Error, ShieldParams, Address>({
    mutationKey: ["shield", config.tokenAddress],
    mutationFn: async ({ amount, fees, approvalStrategy }) =>
      token.shield(amount, { fees, approvalStrategy }),
    ...options,
    onMutate: config.optimistic
      ? async (variables, mutationContext) => {
          const balanceKey = confidentialBalanceQueryKeys.token(config.tokenAddress);
          await queryClient.cancelQueries({ queryKey: balanceKey });
          const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
          for (const [key, value] of previous) {
            if (value !== undefined) {
              queryClient.setQueryData(key, value + variables.amount);
            }
          }
          return (options?.onMutate?.(variables, mutationContext) ??
            config.tokenAddress) as Address;
        }
      : options?.onMutate,
    onError: (error, variables, onMutateResult, context) => {
      if (config.optimistic) {
        // Rollback: invalidate to refetch actual values
        queryClient.invalidateQueries({
          queryKey: confidentialBalanceQueryKeys.token(config.tokenAddress),
        });
      }
      options?.onError?.(error, variables, onMutateResult, context);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: confidentialHandleQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialHandlesQueryKeys.all,
      });
      context.client.resetQueries({
        queryKey: confidentialBalanceQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialBalancesQueryKeys.all,
      });
      // Underlying ERC-20 balance changes after shield — invalidate wagmi useBalance cache
      context.client.invalidateQueries({
        predicate: wagmiBalancePredicates.balanceOf,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
