"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnwrap,
  type UnwrapParams,
  unwrapMutationOptions,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Request an unwrap for a specific amount. Encrypts the amount first.
 * Call {@link useFinalizeUnwrap} after the request is processed on-chain,
 * or use {@link useUnshield} for a single-call orchestration.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption of the unwrap amount failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
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
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, UnwrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, UnwrapParams, Address>({
    ...unwrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnwrap(context.client, config.tokenAddress);
    },
  });
}
