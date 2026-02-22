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

export interface UnshieldParams {
  amount: bigint;
}

export function useUnshield(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, UnshieldParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, UnshieldParams, Hex>({
    mutationKey: ["unshield", config.tokenAddress],
    mutationFn: ({ amount }) => token.unshield(amount),
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
