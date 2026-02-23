"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/token-sdk";
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

/** Configuration for {@link useConfidentialTransfer}. */
export interface UseConfidentialTransferConfig extends UseTokenConfig {
  /**
   * When `true`, optimistically subtracts the transfer amount from cached balance
   * before the transaction confirms. Rolls back on error.
   * @default false
   */
  optimistic?: boolean;
}

/**
 * TanStack Query mutation options factory for confidential transfer.
 *
 * @param token - A `Token` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function confidentialTransferMutationOptions(token: Token) {
  return {
    mutationKey: ["confidentialTransfer", token.address] as const,
    mutationFn: ({ to, amount }: ConfidentialTransferParams) =>
      token.confidentialTransfer(to, amount),
  };
}

/**
 * Encrypt and send a confidential transfer. Invalidates balance caches on success.
 *
 * Errors are {@link TokenError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 *   Set `optimistic: true` to subtract the amount from the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transfer = useConfidentialTransfer({
 *   tokenAddress: "0x...",
 *   optimistic: true,
 * });
 * transfer.mutate(
 *   { to: "0xRecipient", amount: 1000n },
 *   {
 *     onError: (error) => {
 *       if (error instanceof SigningRejectedError) {
 *         // user cancelled — no action needed
 *       }
 *     },
 *   },
 * );
 * ```
 */
export function useConfidentialTransfer(
  config: UseConfidentialTransferConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferParams, Address>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<Address, Error, ConfidentialTransferParams, Address>({
    mutationKey: ["confidentialTransfer", config.tokenAddress],
    mutationFn: ({ to, amount }) => token.confidentialTransfer(to, amount),
    ...options,
    onMutate: config.optimistic
      ? async (variables, mutationContext) => {
          const balanceKey = confidentialBalanceQueryKeys.token(config.tokenAddress);
          await queryClient.cancelQueries({ queryKey: balanceKey });
          const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
          for (const [key, value] of previous) {
            if (value !== undefined) {
              queryClient.setQueryData(key, value - variables.amount);
            }
          }
          return (options?.onMutate?.(variables, mutationContext) ??
            config.tokenAddress) as Address;
        }
      : options?.onMutate,
    onError: (error, variables, onMutateResult, context) => {
      if (config.optimistic) {
        // Rollback: invalidate to refetch actual values
        queryClient.invalidateQueries({
          queryKey: confidentialBalanceQueryKeys.token(config.tokenAddress),
        });
      }
      options?.onError?.(error, variables, onMutateResult, context);
    },
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
