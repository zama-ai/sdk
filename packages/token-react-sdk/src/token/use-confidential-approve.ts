"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

export interface ConfidentialApproveParams {
  spender: Hex;
  until?: number;
}

export function useConfidentialApprove(
  config: UseTokenConfig,
  options?: UseMutationOptions<Hex, Error, ConfidentialApproveParams, Hex>,
) {
  const token = useToken(config);

  return useMutation<Hex, Error, ConfidentialApproveParams, Hex>({
    mutationKey: ["confidentialApprove", config.tokenAddress],
    mutationFn: ({ spender, until }) => token.approve(spender, until),
    ...options,
  });
}
