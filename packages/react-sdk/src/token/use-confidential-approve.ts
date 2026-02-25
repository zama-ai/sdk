"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token, TransactionResult } from "@zama-fhe/sdk";
import { useToken, type UseTokenConfig } from "./use-token";
import { confidentialIsApprovedQueryKeys } from "./use-confidential-is-approved";

/** Parameters passed to the `mutate` function of {@link useConfidentialApprove}. */
export interface ConfidentialApproveParams {
  /** Address to approve as operator. */
  spender: Address;
  /** Unix timestamp until which the approval is valid. Defaults to 1 hour from now. */
  until?: number;
}

/**
 * TanStack Query mutation options factory for confidential approve.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function confidentialApproveMutationOptions(token: Token) {
  return {
    mutationKey: ["confidentialApprove", token.address] as const,
    mutationFn: ({ spender, until }: ConfidentialApproveParams) => token.approve(spender, until),
  };
}

/**
 * Set operator approval for a confidential token. Defaults to 1 hour.
 *
 * Errors are {@link TokenError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link TransactionRevertedError} — on-chain transaction reverted
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
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialApproveParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ConfidentialApproveParams, Address>({
    mutationKey: ["confidentialApprove", config.tokenAddress],
    mutationFn: ({ spender, until }) => token.approve(spender, until),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: confidentialIsApprovedQueryKeys.token(config.tokenAddress),
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
