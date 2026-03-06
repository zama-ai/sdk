"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnshield,
  type ResumeUnshieldParams,
  resumeUnshieldMutationOptions,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Resume an interrupted unshield from an existing unwrap tx hash.
 * Useful when the user submitted the unwrap but the finalize step was
 * interrupted (e.g. page reload, network error).
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const resumeUnshield = useResumeUnshield({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * resumeUnshield.mutate({ unwrapTxHash: "0xabc..." });
 * ```
 */
export function useResumeUnshield(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ResumeUnshieldParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ResumeUnshieldParams, Address>({
    ...resumeUnshieldMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, config.tokenAddress);
    },
  });
}
