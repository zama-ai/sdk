"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
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
      invalidateAfterUnshield(context.client, config.tokenAddress);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
