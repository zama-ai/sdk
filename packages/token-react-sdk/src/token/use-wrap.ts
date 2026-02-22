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

export interface WrapParams {
  amount: bigint;
  fees?: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
}

export function useWrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, WrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, WrapParams, Address>({
    mutationKey: ["wrap", config.tokenAddress],
    mutationFn: async ({ amount, fees, approvalStrategy }) =>
      token.wrap(amount, { fees, approvalStrategy }),
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
