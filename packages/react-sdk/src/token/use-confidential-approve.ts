"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialApproveMutationOptions,
  invalidateAfterApprove,
  type ConfidentialApproveParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Set operator approval for a confidential token. Defaults to 1 hour.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const approve = useConfidentialApprove({ tokenAddress: "0x..." });
 * approve.mutate({ spender: "0xOperator" });
 * ```
 */
export function useConfidentialApprove(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialApproveParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ConfidentialApproveParams, Address>({
    ...confidentialApproveMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterApprove(context.client, config.tokenAddress);
    },
  });
}
