"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

interface ApproveParams {
  spender: Address;
  until?: number;
}

export function useConfidentialApprove(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ApproveParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, ApproveParams, Address>({
    mutationFn: ({ spender, until }) => token.approve(spender, until),
    ...options,
  });
}
