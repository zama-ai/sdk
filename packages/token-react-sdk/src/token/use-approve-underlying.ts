"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

export interface ApproveUnderlyingParams {
  amount?: bigint;
}

export function useApproveUnderlying(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, ApproveUnderlyingParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, ApproveUnderlyingParams, Hex>({
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
