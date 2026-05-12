"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/sdk";
import { signMutationOptions, type SignParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Sign a prepared transaction with the configured signer's `signTransaction`
 * capability and return the RLP-encoded signed bytes. Requires a signer with
 * `signTransaction` (online-only signers throw `SignerCapabilityError`).
 *
 * Pair with {@link useBroadcast} to submit the result.
 *
 * @example
 * ```tsx
 * const { mutateAsync: sign } = useSign();
 * const signedTx = await sign({ prepared });
 * ```
 */
export function useSign<TContext = unknown>(
  options?: UseMutationOptions<Hex, Error, SignParams, TContext>,
): UseMutationResult<Hex, Error, SignParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<Hex, Error, SignParams, TContext>({
    ...signMutationOptions(sdk),
    ...options,
  });
}
