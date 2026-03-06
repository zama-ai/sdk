"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateAfterUnwrap, unwrapAllMutationOptions } from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Request an unwrap for the entire confidential balance.
 * Uses the on-chain balance handle directly (no encryption needed).
 * Call {@link useFinalizeUnwrap} after processing, or use {@link useUnshieldAll} for single-call orchestration.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unwrapAll = useUnwrapAll({ tokenAddress: "0x..." });
 * unwrapAll.mutate();
 * ```
 */
export function useUnwrapAll(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, void, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, void, Address>({
    ...unwrapAllMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnwrap(context.client, config.tokenAddress);
    },
  });
}
