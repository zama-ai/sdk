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

/** Parameters passed to the `mutate` function of {@link useUnshield}. */
export interface UnshieldParams {
  /** Amount to unshield (plaintext — encrypted automatically). */
  amount: bigint;
}

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap → wait for receipt → parse event → finalize.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unshield = useUnshield({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * unshield.mutate({ amount: 500n });
 * ```
 */
export function useUnshield(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, UnshieldParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, UnshieldParams, Address>({
    mutationKey: ["unshield", config.tokenAddress],
    mutationFn: ({ amount }) => token.unshield(amount),
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
