"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferMutationOptions,
  invalidateBalanceQueries,
  type ConfidentialTransferParams,
} from "@zama-fhe/sdk/query";
import {
  applyOptimisticBalanceDelta,
  type OptimisticBalanceSnapshot,
  rollbackOptimisticBalanceDelta,
} from "./optimistic-balance-update";
import { useToken, type UseZamaConfig } from "./use-token";

/** Configuration for {@link useConfidentialTransfer}. */
export interface UseConfidentialTransferConfig extends UseZamaConfig {
  /**
   * When `true`, optimistically subtracts the transfer amount from cached balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Encrypt and send a confidential transfer. Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
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
  options?: UseMutationOptions<
    TransactionResult,
    Error,
    ConfidentialTransferParams,
    OptimisticBalanceSnapshot
  >,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<TransactionResult, Error, ConfidentialTransferParams, Address>({
    ...confidentialTransferMutationOptions(token),
    ...options,
    onMutate: config.optimistic
      ? async (variables, mutationContext) => {
          const snapshot = await applyOptimisticBalanceDelta(
            queryClient,
            config.tokenAddress,
            variables.amount,
            "subtract",
          );
          await options?.onMutate?.(variables, mutationContext);
          return snapshot;
        }
      : options?.onMutate,
    onError: (error, variables, onMutateResult, context) => {
      if (config.optimistic && onMutateResult) {
        rollbackOptimisticBalanceDelta(queryClient, onMutateResult);
      }
      options?.onError?.(error, variables, onMutateResult, context);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateBalanceQueries(context.client, config.tokenAddress);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
