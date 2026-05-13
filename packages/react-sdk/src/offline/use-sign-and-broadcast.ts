"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { signAndBroadcastMutationOptions, type SignAndBroadcastParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Tier-2 mutation: bundled in-process prepare + sign + broadcast for a
 * transaction request. Mirrors `sdk.offline.signAndBroadcast(...)` — the
 * "sign-and-broadcast" entry point of the offline-signing surface.
 *
 * Requires a signer with `signTransaction`. For finer-grained control across
 * a process boundary, use the per-phase Tier-3 hooks ({@link usePrepare},
 * {@link useSign}, {@link useBroadcast}).
 *
 * Cache invalidation flows from SDK events — the hook does not invalidate
 * directly.
 *
 * @example
 * ```tsx
 * const { mutateAsync: signAndBroadcast } = useSignAndBroadcast();
 * const result = await signAndBroadcast({
 *   request: {
 *     kind: "ConfidentialTransfer",
 *     from: userAddress,
 *     token: tokenAddress,
 *     to: recipientAddress,
 *     amount: 1000n,
 *   },
 * });
 * ```
 */
export function useSignAndBroadcast<TContext = unknown>(
  options?: UseMutationOptions<TransactionResult, Error, SignAndBroadcastParams, TContext>,
): UseMutationResult<TransactionResult, Error, SignAndBroadcastParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<TransactionResult, Error, SignAndBroadcastParams, TContext>({
    ...signAndBroadcastMutationOptions(sdk),
    ...options,
  });
}

export type { SignAndBroadcastParams, TransactionResult };
