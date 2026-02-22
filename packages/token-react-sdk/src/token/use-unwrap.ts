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

export interface UnwrapParams {
  amount: bigint;
}

export function useUnwrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, UnwrapParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, UnwrapParams, Hex>({
    mutationKey: ["unwrap", config.tokenAddress],
    mutationFn: ({ amount }) => token.unwrap(amount),
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
