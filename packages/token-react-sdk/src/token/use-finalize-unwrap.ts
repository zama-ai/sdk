"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useFinalizeUnwrap}. */
export interface FinalizeUnwrapParams {
  /** Encrypted amount handle from the UnwrapRequested event. */
  burnAmountHandle: Address;
}

/**
 * TanStack Query mutation options factory for finalize-unwrap.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function finalizeUnwrapMutationOptions(token: Token) {
  return {
    mutationKey: ["finalizeUnwrap", token.address] as const,
    mutationFn: ({ burnAmountHandle }: FinalizeUnwrapParams) =>
      token.finalizeUnwrap(burnAmountHandle),
  };
}

/**
 * Complete an unwrap by providing the public decryption proof.
 * Call this after an unwrap request has been processed on-chain.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const finalize = useFinalizeUnwrap({ tokenAddress: "0x..." });
 * finalize.mutate({ burnAmountHandle: event.encryptedAmount });
 * ```
 */
export function useFinalizeUnwrap(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, FinalizeUnwrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, FinalizeUnwrapParams, Address>({
    mutationKey: ["finalizeUnwrap", config.tokenAddress],
    mutationFn: ({ burnAmountHandle }) => token.finalizeUnwrap(burnAmountHandle),
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
      // Underlying ERC-20 balance changes after finalize — invalidate wagmi useBalance cache
      context.client.invalidateQueries({ queryKey: ["balance"] });
      context.client.invalidateQueries({
        queryKey: underlyingAllowanceQueryKeys.all,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
