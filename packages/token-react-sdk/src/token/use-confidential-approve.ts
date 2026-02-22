"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useConfidentialApprove}. */
export interface ConfidentialApproveParams {
  /** Address to approve as operator. */
  spender: Address;
  /** Unix timestamp until which the approval is valid. Defaults to 1 hour from now. */
  until?: number;
}

/**
 * Set operator approval for a confidential token. Defaults to 1 hour.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const approve = useConfidentialApprove({ tokenAddress: "0x..." });
 * approve.mutate({ spender: "0xOperator" });
 * ```
 */
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
