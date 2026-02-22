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

interface TransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}

export function useConfidentialTransferFrom(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, TransferFromParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, TransferFromParams, Address>({
    mutationKey: ["confidentialTransferFrom", config.tokenAddress],
    mutationFn: ({ from, to, amount }) => token.confidentialTransferFrom(from, to, amount),
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
