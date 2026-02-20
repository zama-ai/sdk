"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./confidential-balance-query-keys";
import {
  useConfidentialToken,
  type UseConfidentialTokenConfig,
} from "./use-confidential-token";

interface UnshieldParams {
  amount: bigint;
}

export function useUnshield(
  config: UseConfidentialTokenConfig,
  options?: UseMutationOptions<Address, Error, UnshieldParams, Address>,
) {
  const token = useConfidentialToken(config);

  return useMutation<Address, Error, UnshieldParams, Address>({
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
