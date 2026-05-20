"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  finalizeUnwrapMutationOptions,
  invalidateAfterUnshield,
  type FinalizeUnwrapParams,
} from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Complete an unwrap by providing the public decryption proof.
 * Call this after an unwrap request has been processed on-chain.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link DecryptionFailedError} — public decryption of the burn amount failed
 * - {@link TransactionRevertedError} — on-chain finalize transaction reverted
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const finalize = useFinalizeUnwrap("0xWrapper");
 * const event = findUnwrapRequested(receipt.logs);
 * if (!event?.unwrapRequestId) throw new Error("UnwrapRequested event missing");
 * finalize.mutate({ unwrapRequestId: event.unwrapRequestId });
 * ```
 */
export function useFinalizeUnwrap(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, FinalizeUnwrapParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<TransactionResult, Error, FinalizeUnwrapParams, Address>({
    ...finalizeUnwrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, token.address);
    },
  });
}
