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

/** Parameters passed to the `mutate` function of {@link useUnwrap}. */
export interface UnwrapParams {
  /** Amount to unwrap (plaintext — encrypted automatically). */
  amount: bigint;
}

/**
 * Request an unwrap for a specific amount. Encrypts the amount first.
 * Call {@link useFinalizeUnwrap} after the request is processed on-chain,
 * or use {@link useUnshield} for a single-call orchestration.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unwrap = useUnwrap({ tokenAddress: "0x..." });
 * unwrap.mutate({ amount: 500n });
 * ```
 */
export function useUnwrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, UnwrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, UnwrapParams, Address>({
    mutationKey: ["unwrap", config.tokenAddress],
    mutationFn: ({ amount }) => token.unwrap(amount),
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
