"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { resumeMutationOptions, type ResumeParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Resume the SDK lifecycle for an externally-broadcast transaction — await
 * the receipt, emit the matching `*Submitted` event, and sync caches without
 * holding the signed bytes. Pair with `usePrepare` when the broadcast happens
 * in a custody control plane or via raw `eth_sendRawTransaction` outside this
 * process.
 *
 * Signer-optional.
 *
 * @example
 * ```tsx
 * const { mutateAsync: resume } = useResume();
 * const result = await resume({ preparedTx, txHash });
 * ```
 */
export function useResume<TContext = unknown>(
  options?: UseMutationOptions<TransactionResult, Error, ResumeParams, TContext>,
): UseMutationResult<TransactionResult, Error, ResumeParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<TransactionResult, Error, ResumeParams, TContext>({
    ...resumeMutationOptions(sdk),
    ...options,
  });
}
