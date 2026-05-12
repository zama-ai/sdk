"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { CredentialPermitResult, TransactionResult } from "@zama-fhe/sdk";
import {
  executeMutationOptions,
  type ExecuteParams,
  type ExecuteResult,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Tier-1 mutation: bundled in-process prepare + sign + broadcast (transaction
 * kind) or prepare + signTypedData + register (`CredentialPermit`).
 *
 * Mirrors `sdk.execute(...)` — generic over `kind`, returns the matching
 * result shape. Requires a signer with `signTransaction` (and, for permits,
 * with `signTypedData`).
 *
 * For finer-grained control across a process boundary, use the per-phase
 * Tier-2 hooks (`usePrepare`, `useSign`, `useBroadcast`,
 * `useRegisterPermit`).
 *
 * Cache invalidation flows from SDK events — the hook does not invalidate
 * directly.
 *
 * @example Transaction kind
 * ```tsx
 * const { mutateAsync: execute } = useExecute();
 * const result = await execute({
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
 * @example Credential permit
 * ```tsx
 * const { mutateAsync: execute } = useExecute();
 * await execute({
 *   request: { kind: "CredentialPermit", from: userAddress, contracts: [tokenAddress] },
 * });
 * ```
 */
export function useExecute<TContext = unknown>(
  options?: UseMutationOptions<ExecuteResult, Error, ExecuteParams, TContext>,
): UseMutationResult<ExecuteResult, Error, ExecuteParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<ExecuteResult, Error, ExecuteParams, TContext>({
    ...executeMutationOptions(sdk),
    ...options,
  });
}

// Re-export the discriminated result type for callers narrowing on
// `kind` of `variables.request` (which TanStack mutate accepts directly).
export type { ExecuteParams, ExecuteResult };
export type { TransactionResult, CredentialPermitResult };
