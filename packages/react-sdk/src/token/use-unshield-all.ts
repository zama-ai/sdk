"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnshield,
  type UnshieldAllParams,
  unshieldAllMutationOptions,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Unshield the entire balance and finalize in one call.
 * Orchestrates: unwrapAll → wait for receipt → parse event → finalize.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
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

  return useMutation<TransactionResult, Error, UnshieldAllParams | void, Address>({
    ...unshieldAllMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, config.tokenAddress);
    },
  });
}
