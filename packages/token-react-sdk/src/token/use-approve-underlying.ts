"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function useApproveUnderlying(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ApproveUnderlyingParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, ApproveUnderlyingParams, Address>({
    mutationKey: ["approveUnderlying", config.tokenAddress],
    mutationFn: ({ amount }) => token.approveUnderlying(amount),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: underlyingAllowanceQueryKeys.all,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
