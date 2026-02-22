"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

export interface WrapETHParams {
  amount: bigint;
  value?: bigint;
}

export function useWrapETH(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, WrapETHParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, WrapETHParams, Hex>({
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
