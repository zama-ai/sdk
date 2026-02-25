"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useShieldETH}. */
export interface ShieldETHParams {
  /** Amount of ETH to wrap (in wei). */
  amount: bigint;
  /** ETH value to send with the transaction. Defaults to `amount`. */
  value?: bigint;
}

/**
 * TanStack Query mutation options factory for shield ETH.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function shieldETHMutationOptions(token: Token) {
  return {
    mutationKey: ["shieldETH", token.address] as const,
    mutationFn: ({ amount, value }: ShieldETHParams) => token.shieldETH(amount, value),
  };
}

/**
 * Shield native ETH into confidential tokens.
 * Invalidates balance caches on success.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shieldETH = useShieldETH({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * shieldETH.mutate({ amount: 1000000000000000000n }); // 1 ETH
 * ```
 */
export function useShieldETH(
  config: UseTokenConfig,
  options?: UseMutationOptions<TransactionResult, Error, ShieldETHParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ShieldETHParams, Address>({
    mutationKey: ["shieldETH", config.tokenAddress],
    mutationFn: ({ amount, value }) => token.shieldETH(amount, value),
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
