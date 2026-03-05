"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token, TransactionResult, TransferCallbacks } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseZamaConfig } from "./use-token";

/** Parameters passed to the `mutate` function of {@link useConfidentialTransferFrom}. */
export interface ConfidentialTransferFromParams {
  /** Address to transfer from. Caller must be an approved operator. */
  from: Address;
  /** Recipient address. */
  to: Address;
  /** Amount to transfer (plaintext — encrypted automatically). */
  amount: bigint;
  /** Optional progress callbacks for the multi-step transfer flow. */
  callbacks?: TransferCallbacks;
}

/**
 * TanStack Query mutation options factory for confidential transfer-from.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function confidentialTransferFromMutationOptions(token: Token) {
  return {
    mutationKey: ["confidentialTransferFrom", token.address] as const,
    mutationFn: ({ from, to, amount, callbacks }: ConfidentialTransferFromParams) =>
      token.confidentialTransferFrom(from, to, amount, callbacks),
  };
}

/**
 * Operator transfer on behalf of another address. Caller must be an approved operator.
 * Invalidates balance caches on success.
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transferFrom = useConfidentialTransferFrom({ tokenAddress: "0x..." });
 * transferFrom.mutate({ from: "0xOwner", to: "0xRecipient", amount: 500n });
 * ```
 */
export function useConfidentialTransferFrom(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialTransferFromParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ConfidentialTransferFromParams, Address>({
    mutationKey: ["confidentialTransferFrom", config.tokenAddress],
    mutationFn: ({ from, to, amount, callbacks }) =>
      token.confidentialTransferFrom(from, to, amount, callbacks),
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
