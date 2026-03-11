"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  finalizeUnwrapMutationOptions,
  invalidateAfterUnshield,
  type FinalizeUnwrapParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Complete an unwrap by providing the public decryption proof.
 * Call this after an unwrap request has been processed on-chain.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link DecryptionFailedError} — public decryption of the burn amount failed
 * - {@link TransactionRevertedError} — on-chain finalize transaction reverted
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
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, FinalizeUnwrapParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, FinalizeUnwrapParams, Address>({
    ...finalizeUnwrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, config.tokenAddress);
    },
  });
}
