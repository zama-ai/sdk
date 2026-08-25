"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { UnshieldAlreadyFinalizedError } from "@zama-fhe/sdk";
import {
  invalidateAfterUnshield,
  type ResumeUnshieldParams,
  resumeUnshieldMutationOptions,
} from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Resume an interrupted unshield from an existing unwrap tx hash.
 * Useful when the user submitted the unwrap but the finalize step was
 * interrupted (e.g. page reload, network error).
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link UnshieldAlreadyFinalizedError} — the unwrap was already finalized and the
 *   funds delivered; the SDK cleared the stale pending state and this hook refreshed
 *   the affected queries, so dismiss the resume prompt
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const resumeUnshield = useResumeUnshield("0xWrapper");
 * resumeUnshield.mutate({ unwrapTxHash: "0xabc..." });
 * ```
 */
export function useResumeUnshield(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, ResumeUnshieldParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<TransactionResult, Error, ResumeUnshieldParams, Address>({
    ...resumeUnshieldMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, token.address);
    },
    onError: (error, variables, onMutateResult, context) => {
      options?.onError?.(error, variables, onMutateResult, context);
      // The unshield settled elsewhere and the SDK cleared the stored pointer:
      // refresh so the pending-unshield banner and balances converge.
      if (error instanceof UnshieldAlreadyFinalizedError) {
        invalidateAfterUnshield(context.client, token.address);
      }
    },
  });
}
