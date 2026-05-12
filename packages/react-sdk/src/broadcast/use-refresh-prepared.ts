"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { PreparedFor, TransactionKind } from "@zama-fhe/sdk";
import { refreshPreparedMutationOptions, type RefreshPreparedParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Re-stamp a prepared transaction with the current chain state — fresh
 * nonce, fee parameters, and gas limit. Call this before external signing
 * when the gap since {@link usePrepare} was long enough for values to
 * drift (custodian approval ceremonies, multi-party signing, etc.).
 *
 * Signer-optional. The original `prepared` is left untouched (immutable).
 *
 * @example
 * ```tsx
 * const { mutateAsync: refresh } = useRefreshPrepared();
 * const fresh = await refresh({ prepared });
 * ```
 */
export function useRefreshPrepared<TContext = unknown>(
  options?: UseMutationOptions<
    PreparedFor<TransactionKind>,
    Error,
    RefreshPreparedParams,
    TContext
  >,
): UseMutationResult<PreparedFor<TransactionKind>, Error, RefreshPreparedParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<PreparedFor<TransactionKind>, Error, RefreshPreparedParams, TContext>({
    ...refreshPreparedMutationOptions(sdk),
    ...options,
  });
}
