"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnshield,
  invalidateAfterUnshieldError,
  type UnshieldParams,
  unshieldMutationOptions,
} from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap → wait for receipt → parse event → finalize.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption failed during unwrap
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link UnshieldAlreadyFinalizedError}: the unwrap request was already finalized. The
 *   funds arrived and this hook refreshes the balances, so treat it as completion
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unshield = useUnshield("0xWrapper");
 * unshield.mutate({ amount: 500n });
 * ```
 */
export function useUnshield(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, UnshieldParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<TransactionResult, Error, UnshieldParams, Address>({
    ...unshieldMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, token.address);
    },
    onError: (error, variables, onMutateResult, context) => {
      options?.onError?.(error, variables, onMutateResult, context);
      invalidateAfterUnshieldError(context.client, token.address, error);
    },
  });
}
