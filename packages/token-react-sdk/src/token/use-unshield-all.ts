"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

/**
 * TanStack Query mutation options factory for unshield-all.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function unshieldAllMutationOptions(token: Token) {
  return {
    mutationKey: ["unshieldAll", token.address] as const,
    mutationFn: () => token.unshieldAll(),
  };
}

/**
 * Unshield the entire balance and finalize in one call.
 * Orchestrates: unwrapAll → wait for receipt → parse event → finalize.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unshieldAll = useUnshieldAll({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * unshieldAll.mutate();
 * ```
 */
export function useUnshieldAll(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, void, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, void, Address>({
    mutationKey: ["unshieldAll", config.tokenAddress],
    mutationFn: () => token.unshieldAll(),
    ...options,
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
      context.client.invalidateQueries({
        queryKey: underlyingAllowanceQueryKeys.all,
      });
      context.client.invalidateQueries({
        predicate: wagmiBalancePredicates.balanceOf,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
