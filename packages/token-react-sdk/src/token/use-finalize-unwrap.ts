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

export interface FinalizeUnwrapParams {
  burnAmountHandle: Hex;
}

export function useFinalizeUnwrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, FinalizeUnwrapParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, FinalizeUnwrapParams, Hex>({
    mutationKey: ["finalizeUnwrap", config.tokenAddress],
    mutationFn: ({ burnAmountHandle }) => token.finalizeUnwrap(burnAmountHandle),
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
