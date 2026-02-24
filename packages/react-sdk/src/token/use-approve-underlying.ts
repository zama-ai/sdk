"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/sdk";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useApproveUnderlying}. */
export interface ApproveUnderlyingParams {
  /** Approval amount. Defaults to max uint256 if omitted. */
  amount?: bigint;
}

/**
 * TanStack Query mutation options factory for approve-underlying.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function approveUnderlyingMutationOptions(token: Token) {
  return {
    mutationKey: ["approveUnderlying", token.address] as const,
    mutationFn: ({ amount }: ApproveUnderlyingParams) => token.approveUnderlying(amount),
  };
}

/**
 * Approve the wrapper contract to spend the underlying ERC-20.
 * Defaults to max uint256. Resets to zero first if there's an existing
 * non-zero allowance (required by tokens like USDT).
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const approve = useApproveUnderlying({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * approve.mutate({}); // max approval
 * approve.mutate({ amount: 1000n }); // exact amount
 * ```
 */
export function useApproveUnderlying(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ApproveUnderlyingParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, ApproveUnderlyingParams, Address>({
    mutationKey: ["approveUnderlying", config.tokenAddress],
    mutationFn: ({ amount }) => token.approveUnderlying(amount),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: underlyingAllowanceQueryKeys.all,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
