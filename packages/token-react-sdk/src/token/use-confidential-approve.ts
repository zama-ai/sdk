"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import {
  useConfidentialToken,
  type UseConfidentialTokenConfig,
} from "./use-confidential-token";

interface ApproveParams {
  spender: Address;
  until?: number;
}

export function useConfidentialApprove(
  config: UseConfidentialTokenConfig,
  options?: UseMutationOptions<Address, Error, ApproveParams, Address>,
) {
  const token = useConfidentialToken(config);

  return useMutation<Address, Error, ApproveParams, Address>({
    mutationFn: ({ spender, until }) => token.approve(spender, until),
    ...options,
  });
}
