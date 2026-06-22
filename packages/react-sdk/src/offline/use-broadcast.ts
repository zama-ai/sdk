"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { broadcastMutationOptions, type BroadcastParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Submit a previously-signed transaction, await its receipt, and return
 * the {@link TransactionResult}. Signer-optional — `broadcast` reads
 * `from`/nonce/fees from the signed payload itself.
 *
 * Cache invalidation is driven by the SDK's {@link ZamaSDKEvents} listener — the
 * hook does not invalidate directly.
 *
 * @example
 * ```tsx
 * const { mutateAsync: broadcast } = useBroadcast();
 * const result = await broadcast({ preparedTx, signedTx });
 * ```
 */
export function useBroadcast<TContext = unknown>(
  options?: UseMutationOptions<TransactionResult, Error, BroadcastParams, TContext>,
): UseMutationResult<TransactionResult, Error, BroadcastParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<TransactionResult, Error, BroadcastParams, TContext>({
    ...broadcastMutationOptions(sdk),
    ...options,
  });
}
