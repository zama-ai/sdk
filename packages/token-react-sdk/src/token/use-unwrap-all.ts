"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

/**
 * TanStack Query mutation options factory for unwrap-all.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function unwrapAllMutationOptions(token: Token) {
  return {
    mutationKey: ["unwrapAll", token.address] as const,
    mutationFn: () => token.unwrapAll(),
  };
}

/**
 * Request an unwrap for the entire confidential balance.
 * Uses the on-chain balance handle directly (no encryption needed).
 * Call {@link useFinalizeUnwrap} after processing, or use {@link useUnshieldAll} for single-call orchestration.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unwrapAll = useUnwrapAll({ tokenAddress: "0x..." });
 * unwrapAll.mutate();
 * ```
 */
export function useUnwrapAll(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, void, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, void, Address>({
    mutationKey: ["unwrapAll", config.tokenAddress],
    mutationFn: () => token.unwrapAll(),
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
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
