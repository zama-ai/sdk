"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useWrap}. */
export interface WrapParams {
  /** Amount of underlying ERC-20 tokens to wrap. */
  amount: bigint;
  /** Optional fee amount (for native ETH wrapping with fees). */
  fees?: bigint;
  /** ERC-20 approval strategy: `"exact"` (default), `"max"`, or `"skip"`. */
  approvalStrategy?: "max" | "exact" | "skip";
}

/** Configuration for {@link useWrap}. */
export interface UseWrapConfig extends UseTokenConfig {
  /**
   * When `true`, optimistically adds the wrap amount to the cached confidential balance
   * before the transaction confirms. Rolls back on error.
   * @default false
   */
  optimistic?: boolean;
}

/**
 * TanStack Query mutation options factory for wrap (shield).
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function wrapMutationOptions(token: Token) {
  return {
    mutationKey: ["wrap", token.address] as const,
    mutationFn: async ({ amount, fees, approvalStrategy }: WrapParams) =>
      token.wrap(amount, { fees, approvalStrategy }),
  };
}

/**
 * Wrap (shield) public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically. Invalidates balance caches on success.
 *
 * Errors are {@link TokenError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link ApprovalFailedError} — ERC-20 approval transaction failed
 * - {@link TransactionRevertedError} — wrap transaction reverted
 *
 * @param config - Token and wrapper addresses.
 *   Set `optimistic: true` to add the amount to the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const wrap = useWrap({ tokenAddress: "0x...", wrapperAddress: "0x...", optimistic: true });
 * wrap.mutate({ amount: 1000n });
 * ```
 */
export function useWrap(
  config: UseWrapConfig,
  options?: UseMutationOptions<Address, Error, WrapParams, Address>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<Address, Error, WrapParams, Address>({
    mutationKey: ["wrap", config.tokenAddress],
    mutationFn: async ({ amount, fees, approvalStrategy }) =>
      token.wrap(amount, { fees, approvalStrategy }),
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
