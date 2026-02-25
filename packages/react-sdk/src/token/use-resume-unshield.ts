"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Hex, TransactionResult, UnshieldCallbacks, Token } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseZamaConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useResumeUnshield}. */
export interface ResumeUnshieldParams {
  /** The unwrap transaction hash from a previously interrupted unshield. */
  unwrapTxHash: Hex;
  /** Optional progress callbacks for the finalization flow. */
  callbacks?: UnshieldCallbacks;
}

/**
 * TanStack Query mutation options factory for resume-unshield.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function resumeUnshieldMutationOptions(token: Token) {
  return {
    mutationKey: ["resumeUnshield", token.address] as const,
    mutationFn: ({ unwrapTxHash, callbacks }: ResumeUnshieldParams) =>
      token.resumeUnshield(unwrapTxHash, callbacks),
  };
}

/**
 * Resume an interrupted unshield from an existing unwrap tx hash.
 * Useful when the user submitted the unwrap but the finalize step was
 * interrupted (e.g. page reload, network error).
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const resumeUnshield = useResumeUnshield({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * resumeUnshield.mutate({ unwrapTxHash: "0xabc..." });
 * ```
 */
export function useResumeUnshield(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ResumeUnshieldParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ResumeUnshieldParams, Address>({
    mutationKey: ["resumeUnshield", config.tokenAddress],
    mutationFn: ({ unwrapTxHash, callbacks }) => token.resumeUnshield(unwrapTxHash, callbacks),
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
