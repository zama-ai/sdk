"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  completeFromTxHashMutationOptions,
  type CompleteFromTxHashParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Cache-sync escape hatch when an external process broadcast
 * `prepared.unsignedTx` directly (air-gapped flows, custody pipelines that
 * don't return signed bytes). Awaits the receipt + emits the matching
 * `*Submitted` event so caches stay in sync.
 *
 * Signer-optional.
 *
 * @example
 * ```tsx
 * const { mutateAsync: complete } = useCompleteFromTxHash();
 * const result = await complete({ prepared, txHash });
 * ```
 */
export function useCompleteFromTxHash<TContext = unknown>(
  options?: UseMutationOptions<TransactionResult, Error, CompleteFromTxHashParams, TContext>,
): UseMutationResult<TransactionResult, Error, CompleteFromTxHashParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<TransactionResult, Error, CompleteFromTxHashParams, TContext>({
    ...completeFromTxHashMutationOptions(sdk),
    ...options,
  });
}
