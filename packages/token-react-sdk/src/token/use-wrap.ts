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

interface WrapParams {
  amount: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
  fees?: bigint;
}

export function useWrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, WrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, WrapParams, Address>({
    mutationFn: async ({ amount, approvalStrategy, fees }) =>
      token.wrap(amount, { approvalStrategy, fees }),
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
