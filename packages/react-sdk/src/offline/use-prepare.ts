"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type {
  DecryptionPermitRequest,
  PermitKind,
  PreparedFor,
  PreparedPermitFor,
  TransactionKind,
  TransactionPrepareRequest,
} from "@zama-fhe/sdk";
import { prepareMutationOptions, type PrepareParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Build an unsigned transaction (for transaction kinds) or an EIP-712
 * typed-data envelope (for the `DecryptionPermit` kind). Generic over `kind`
 * — the return shape narrows on the request discriminant.
 *
 * Signer-optional: works without a configured signer (canonical cross-process
 * custody shape — the back-end signer service consumes `prepared.unsignedTx`
 * and returns signed bytes).
 *
 * Pair with {@link useSign} + {@link useBroadcast} for transaction kinds, or
 * an external `signTypedData` + {@link useRegisterPermit} for permits.
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
 *
 * @example Decryption permit
 * ```tsx
 * const { mutateAsync: prepare } = usePrepare();
 * const prepared = await prepare({
 *   request: { kind: "DecryptionPermit", from: userAddress, contracts: [tokenAddress] },
 * });
 * ```
 */
export function usePrepare<TContext = unknown>(
  options?: UseMutationOptions<
    PreparedFor<TransactionKind> | PreparedPermitFor<PermitKind>,
    Error,
    PrepareParams,
    TContext
  >,
): UseMutationResult<
  PreparedFor<TransactionKind> | PreparedPermitFor<PermitKind>,
  Error,
  PrepareParams,
  TContext
> {
  const sdk = useZamaSDK();
  return useMutation<
    PreparedFor<TransactionKind> | PreparedPermitFor<PermitKind>,
    Error,
    PrepareParams,
    TContext
  >({
    ...prepareMutationOptions(sdk),
    ...options,
  });
}

// Re-export the canonical request types so callers can type their literals
// without importing from two places.
export type { TransactionPrepareRequest, DecryptionPermitRequest };
