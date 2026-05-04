"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialSetOperatorMutationOptions,
  invalidateAfterSetOperator,
  type ConfidentialSetOperatorParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "../token/use-token";

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
 * const setOperator = useConfidentialSetOperator({ tokenAddress: "0x..." });
 * setOperator.mutate({ operator: "0xOperator" });
 * ```
 */
export function useConfidentialSetOperator(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialSetOperatorParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ConfidentialSetOperatorParams, Address>({
    ...confidentialSetOperatorMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterSetOperator(context.client, token.address);
    },
  });
}
