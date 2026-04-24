"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateAfterUnwrap, unwrapAllMutationOptions } from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "../token/use-token";

/**
 * Request an unwrap for the entire confidential balance.
 * Uses the on-chain balance handle directly (no encryption needed).
 * Call {@link useFinalizeUnwrap} after processing, or use {@link useUnshieldAll} for single-call orchestration.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link TransactionRevertedError} — on-chain transaction reverted
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
      invalidateAfterUnwrap(context.client, token.address);
    },
  });
}
