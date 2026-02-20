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

interface FinalizeUnwrapParams {
  burnAmountHandle: Address;
}

export function useFinalizeUnwrap(
  config: UseConfidentialTokenConfig,
  options?: UseMutationOptions<Address, Error, FinalizeUnwrapParams, Address>,
) {
  const token = useConfidentialToken(config);

  return useMutation<Address, Error, FinalizeUnwrapParams, Address>({
    mutationFn: ({ burnAmountHandle }) =>
      token.finalizeUnwrap(burnAmountHandle),
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
