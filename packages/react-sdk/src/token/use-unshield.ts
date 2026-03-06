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

/** Parameters passed to the `mutate` function of {@link useUnshield}. */
export interface UnshieldParams {
  /** Amount to unshield (plaintext — encrypted automatically). */
  amount: bigint;
  /** Optional progress callbacks for the multi-step unshield flow. */
  callbacks?: UnshieldCallbacks;
}

/**
 * TanStack Query mutation options factory for unshield.
 *
 * Note: unlike {@link useUnshield}, this factory does **not** auto-persist
 * the pending unshield state. Use `savePendingUnshield`/`clearPendingUnshield`
 * manually if you need resumability.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function unshieldMutationOptions(token: Token) {
  return {
    mutationKey: ["unshield", token.address] as const,
    mutationFn: ({ amount, callbacks }: UnshieldParams) => token.unshield(amount, callbacks),
  };
}

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap → wait for receipt → parse event → finalize.
 *
 * Automatically persists the unwrap tx hash to storage so the unshield can
 * be resumed after interruptions (e.g. page reload). The pending state is
 * cleared on successful finalization.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
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
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, UnshieldParams, Address>,
) {
  const token = useToken(config);
  const sdk = useZamaSDK();
  const wrapperAddress = config.wrapperAddress ?? config.tokenAddress;

  return useMutation<TransactionResult, Error, UnshieldParams, Address>({
    mutationKey: ["unshield", config.tokenAddress],
    mutationFn: async ({ amount, callbacks }) => {
      const [accountAddress, chainId] = await Promise.all([
        sdk.signer.getAddress(),
        sdk.signer.getChainId(),
      ]);
      const scope = { accountAddress, chainId, wrapperAddress };
      return token.unshield(amount, wrapUnshieldCallbacks(sdk.storage, scope, callbacks));
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
