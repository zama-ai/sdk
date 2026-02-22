"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useConfidentialTransfer}. */
export interface ConfidentialTransferParams {
  /** Recipient address. */
  to: Address;
  /** Amount to transfer (plaintext — encrypted automatically). */
  amount: bigint;
}

/**
 * Encrypt and send a confidential transfer. Invalidates balance caches on success.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transfer = useConfidentialTransfer({ tokenAddress: "0x..." });
 * transfer.mutate({ to: "0xRecipient", amount: 1000n });
 * ```
 */
export function useConfidentialTransfer(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferParams, Address>,
) {
  const token = useToken(config);

  return useMutation<Address, Error, ConfidentialTransferParams, Address>({
    mutationKey: ["confidentialTransfer", config.tokenAddress],
    mutationFn: ({ to, amount }) => token.confidentialTransfer(to, amount),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: confidentialHandleQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialHandlesQueryKeys.all,
      });
      context.client.resetQueries({
        queryKey: confidentialBalanceQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialBalancesQueryKeys.all,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
