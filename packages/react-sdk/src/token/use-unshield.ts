"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useUnshield}. */
export interface UnshieldParams {
  /** Amount to unshield (plaintext — encrypted automatically). */
  amount: bigint;
}

/**
 * TanStack Query mutation options factory for unshield.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function unshieldMutationOptions(token: Token) {
  return {
    mutationKey: ["unshield", token.address] as const,
    mutationFn: ({ amount }: UnshieldParams) => token.unshield(amount),
  };
}

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap → wait for receipt → parse event → finalize.
 *
 * Errors are {@link TokenError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption failed during unwrap
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
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
      context.client.invalidateQueries({
        queryKey: underlyingAllowanceQueryKeys.all,
      });
      context.client.invalidateQueries({
        predicate: wagmiBalancePredicates.balanceOf,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
