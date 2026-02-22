"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

export interface ConfidentialApproveParams {
  spender: Address;
  until?: number;
}

export function useConfidentialApprove(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialApproveParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, ConfidentialApproveParams, Address>({
    mutationKey: ["confidentialApprove", config.tokenAddress],
    mutationFn: ({ spender, until }) => token.approve(spender, until),
    ...options,
  });
}
