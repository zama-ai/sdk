"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  approveUnderlyingMutationOptions,
  invalidateAfterApproveUnderlying,
  type ApproveUnderlyingParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

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
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ApproveUnderlyingParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ApproveUnderlyingParams, Address>({
    ...approveUnderlyingMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterApproveUnderlying(context.client, config.tokenAddress);
    },
  });
}
