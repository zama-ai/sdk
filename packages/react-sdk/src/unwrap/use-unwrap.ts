"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnwrap,
  type UnwrapParams,
  unwrapMutationOptions,
} from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Request an unwrap for a specific amount. Encrypts the amount first.
 * Call {@link useFinalizeUnwrap} after the request is processed on-chain,
 * or use {@link useUnshield} for a single-call orchestration.
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
 * unwrap.mutate({ amount: 500n });
 * ```
 */
export function useUnwrap(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, UnwrapParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<TransactionResult, Error, UnwrapParams, Address>({
    ...unwrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnwrap(context.client, token.address);
    },
  });
}
