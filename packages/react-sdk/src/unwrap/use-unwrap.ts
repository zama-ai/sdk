"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, UnwrapResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnwrap,
  type UnwrapParams,
  unwrapMutationOptions,
} from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Request an unwrap for a specific amount. Encrypts the amount first.
 * Pass the result to {@link useFinalizeUnwrap} once the request is processed
 * on-chain, or use {@link useUnshield} for a single-call orchestration.
 *
 * The mutation `data` is an {@link UnwrapResult} — its `unwrapRequestId` feeds
 * straight into `useFinalizeUnwrap`, so no manual receipt decoding is needed.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption of the unwrap amount failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unwrap = useUnwrap("0xWrapper");
 * const finalize = useFinalizeUnwrap("0xWrapper");
 *
 * async function unshield() {
 *  const result = await unwrap.mutateAsync({ amount: 500n });
 *  await finalize.mutateAsync(result);
 * }
 * ```
 */
export function useUnwrap(
  address: Address,
  options?: UseMutationOptions<UnwrapResult, Error, UnwrapParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<UnwrapResult, Error, UnwrapParams, Address>({
    ...unwrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnwrap(context.client, token.address);
    },
  });
}
