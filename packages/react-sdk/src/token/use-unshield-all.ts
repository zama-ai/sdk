"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token, TransactionResult, UnshieldCallbacks } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  wagmiBalancePredicates,
} from "./balance-query-keys";
import { underlyingAllowanceQueryKeys } from "./use-underlying-allowance";
import { useToken, type UseZamaConfig } from "./use-token";
import { useZamaSDK } from "../provider";
import { wrapUnshieldCallbacks } from "./unshield-storage";

/**
 * TanStack Query mutation options factory for unshield-all.
 *
 * Note: unlike {@link useUnshieldAll}, this factory does **not** auto-persist
 * the pending unshield state. Use `savePendingUnshield`/`clearPendingUnshield`
 * manually if you need resumability.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
/** Parameters passed to the `mutate` function of {@link useUnshieldAll}. */
export interface UnshieldAllParams {
  /** Optional progress callbacks for the multi-step unshield flow. */
  callbacks?: UnshieldCallbacks;
}

export function unshieldAllMutationOptions(token: Token) {
  return {
    mutationKey: ["unshieldAll", token.address] as const,
    mutationFn: (params?: UnshieldAllParams) => token.unshieldAll(params?.callbacks),
  };
}

/**
 * Unshield the entire balance and finalize in one call.
 * Orchestrates: unwrapAll → wait for receipt → parse event → finalize.
 *
 * Automatically persists the unwrap tx hash to storage so the unshield can
 * be resumed after interruptions (e.g. page reload). The pending state is
 * cleared on successful finalization.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unshieldAll = useUnshieldAll({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * unshieldAll.mutate();
 * ```
 */
export function useUnshieldAll(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, UnshieldAllParams | void, Address>,
) {
  const token = useToken(config);
  const sdk = useZamaSDK();
  const wrapperAddress = config.wrapperAddress ?? config.tokenAddress;

  return useMutation<TransactionResult, Error, UnshieldAllParams | void, Address>({
    mutationKey: ["unshieldAll", config.tokenAddress],
    mutationFn: async (params) => {
      const [accountAddress, chainId] = await Promise.all([
        sdk.signer.getAddress(),
        sdk.signer.getChainId(),
      ]);
      const scope = { accountAddress, chainId, wrapperAddress };
      return token.unshieldAll(wrapUnshieldCallbacks(sdk.storage, scope, params?.callbacks));
    },
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
