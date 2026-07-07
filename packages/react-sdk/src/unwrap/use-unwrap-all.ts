"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, UnwrapResult } from "@zama-fhe/sdk";
import { invalidateAfterUnwrap, unwrapAllMutationOptions } from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Request an unwrap for the entire confidential balance.
 * Uses the on-chain balance handle directly (no encryption needed).
 * Pass the result to {@link useFinalizeUnwrap} after processing, or use
 * {@link useUnshieldAll} for single-call orchestration.
 *
 * The mutation `data` is an {@link UnwrapResult}; its `unwrapRequestId` feeds
 * straight into `useFinalizeUnwrap`.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unwrapAll = useUnwrapAll("0xWrapper");
 * const finalize = useFinalizeUnwrap("0xWrapper");
 *
 * async function unshieldAll() {
 *  const result = await unwrapAll.mutateAsync();
 *  await finalize.mutateASync(result);
 * }
 * ```
 */
export function useUnwrapAll(
  address: Address,
  options?: UseMutationOptions<UnwrapResult, Error, void, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<UnwrapResult, Error, void, Address>({
    ...unwrapAllMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnwrap(context.client, token.address);
    },
  });
}
