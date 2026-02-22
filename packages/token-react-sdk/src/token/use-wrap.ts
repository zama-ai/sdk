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

/** Parameters passed to the `mutate` function of {@link useWrap}. */
export interface WrapParams {
  /** Amount of underlying ERC-20 tokens to wrap. */
  amount: bigint;
  /** Optional fee amount (for native ETH wrapping with fees). */
  fees?: bigint;
  /** ERC-20 approval strategy: `"exact"` (default), `"max"`, or `"skip"`. */
  approvalStrategy?: "max" | "exact" | "skip";
}

/**
 * Wrap (shield) public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically. Invalidates balance caches on success.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const wrap = useWrap({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * wrap.mutate({ amount: 1000n });
 * ```
 */
export function useWrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, WrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, WrapParams, Address>({
    mutationKey: ["wrap", config.tokenAddress],
    mutationFn: async ({ amount, fees, approvalStrategy }) =>
      token.wrap(amount, { fees, approvalStrategy }),
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
