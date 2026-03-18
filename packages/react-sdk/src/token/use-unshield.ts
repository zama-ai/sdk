"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterUnshield,
  type UnshieldParams,
  unshieldMutationOptions,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Unshield a specific amount and finalize in one call.
 * Orchestrates: unwrap → wait for receipt → parse event → finalize.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption failed during unwrap
 * - {@link DecryptionFailedError} — public decryption failed during finalize
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const unshield = useUnshield({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * unshield.mutate({ amount: 500n });
 * ```
 */
export function useUnshield(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, UnshieldParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, UnshieldParams, Address>({
    ...unshieldMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterUnshield(context.client, config.tokenAddress);
    },
  });
}
