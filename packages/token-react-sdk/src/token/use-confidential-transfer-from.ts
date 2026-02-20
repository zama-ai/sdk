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

interface TransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}

export function useConfidentialTransferFrom(
  config: UseConfidentialTokenConfig,
  options?: UseMutationOptions<Address, Error, TransferFromParams, Address>,
) {
  const token = useConfidentialToken(config);

  return useMutation<Address, Error, TransferFromParams, Address>({
    mutationFn: ({ from, to, amount }) =>
      token.confidentialTransferFrom(from, to, amount),
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
