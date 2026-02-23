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

/** Parameters passed to the `mutate` function of {@link useWrapETH}. */
export interface WrapETHParams {
  /** Amount of ETH to wrap (in wei). */
  amount: bigint;
  /** ETH value to send with the transaction. Defaults to `amount`. */
  value?: bigint;
}

/**
 * TanStack Query mutation options factory for wrap ETH (shield).
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function wrapETHMutationOptions(token: Token) {
  return {
    mutationKey: ["wrapETH", token.address] as const,
    mutationFn: ({ amount, value }: WrapETHParams) => token.wrapETH(amount, value),
  };
}

/**
 * Wrap (shield) native ETH into confidential tokens.
 * Invalidates balance caches on success.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const wrapETH = useWrapETH({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * wrapETH.mutate({ amount: 1000000000000000000n }); // 1 ETH
 * ```
 */
export function useWrapETH(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, WrapETHParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, WrapETHParams, Address>({
    mutationKey: ["wrapETH", config.tokenAddress],
    mutationFn: ({ amount, value }) => token.wrapETH(amount, value),
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
