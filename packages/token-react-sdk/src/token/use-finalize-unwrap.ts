"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

interface FinalizeUnwrapParams {
  burnAmountHandle: Address;
}

export function useFinalizeUnwrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, FinalizeUnwrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, FinalizeUnwrapParams, Address>({
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
