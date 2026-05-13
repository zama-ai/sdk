"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { attachMutationOptions, type AttachParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Attach this SDK to an externally-broadcast transaction — await the receipt,
 * emit the matching `*Submitted` event, and sync caches without holding the
 * signed bytes. Pair with `usePrepare` when the broadcast happens in a custody
 * control plane or via raw `eth_sendRawTransaction` outside this process.
 *
 * Signer-optional.
 *
 * @example
 * ```tsx
 * const { mutateAsync: attach } = useAttach();
 * const result = await attach({ prepared, txHash });
 * ```
 */
export function useAttach<TContext = unknown>(
  options?: UseMutationOptions<TransactionResult, Error, AttachParams, TContext>,
): UseMutationResult<TransactionResult, Error, AttachParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<TransactionResult, Error, AttachParams, TContext>({
    ...attachMutationOptions(sdk),
    ...options,
  });
}
