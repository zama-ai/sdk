"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { PreparedFor, TransactionKind } from "@zama-fhe/sdk";
import { prepareMutationOptions, type PrepareParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Build an unsigned transaction for a transaction-kind request.
 *
 * Signer-optional: works without a configured signer (canonical cross-process
 * custody shape — the back-end signer service consumes `prepared.unsignedTx`
 * and returns signed bytes).
 *
 * Pair with {@link useSign} + {@link useBroadcast} (or an external signer +
 * {@link useBroadcast} / {@link useResume}). Decryption permits are not
 * transactions — acquire them via {@link useGrantPermit}, which signs with the
 * configured signer (including an out-of-process custody signer).
 *
 * @example Transaction kind
 * ```tsx
 * const { mutateAsync: prepare } = usePrepare();
 * const prepared = await prepare({
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
export function usePrepare<TContext = unknown>(
  options?: UseMutationOptions<PreparedFor<TransactionKind>, Error, PrepareParams, TContext>,
): UseMutationResult<PreparedFor<TransactionKind>, Error, PrepareParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<PreparedFor<TransactionKind>, Error, PrepareParams, TContext>({
    ...prepareMutationOptions(sdk),
    ...options,
  });
}

// Re-export the canonical request type so callers can type their literals
// without importing from two places.

export { type PrepareTransactionRequest } from "@zama-fhe/sdk";
