"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferAndCallMutationOptions,
  invalidateAfterTransfer,
  type ConfidentialTransferAndCallParams,
} from "@zama-fhe/sdk/query";
import {
  applyOptimisticBalanceDelta,
  rollbackOptimisticBalanceDelta,
  unwrapOptimisticCallerContext,
} from "../balance/optimistic-balance-update";
import { useToken } from "../token/use-token";

/** Configuration for {@link useConfidentialTransferAndCall}. */
export interface UseConfidentialTransferAndCallConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /**
   * When `true`, optimistically subtracts the transfer amount from cached balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Encrypt and send a `confidentialTransferAndCall` — an ERC-7984 confidential
 * transfer that also invokes the recipient's receiver hook in a single
 * transaction. The caller crafts the opaque `data` payload; the SDK does not
 * encode, validate, or interpret it. Invalidates balance caches on success.
 *
 * @param config - Token address identifying the token. Set `optimistic: true` to
 *   subtract the amount from the cached balance immediately.
 * @param options - React Query mutation options.
 * @returns Mutation result whose `data` is the {@link TransactionResult} on success.
 *
 * @throws if the user rejects the wallet prompt. {@link SigningRejectedError}
 * @throws if FHE encryption fails. {@link EncryptionFailedError}
 * @throws if the on-chain transaction reverts. {@link TransactionRevertedError}
 *
 * @example
 * ```tsx
 * const transferAndCall = useConfidentialTransferAndCall({ address: "0xToken" });
 * transferAndCall.mutate({
 *   to: "0xReceiverContract",
 *   amount: 1000n,
 *   data: "0xabcd", // caller-encoded payload
 * });
 * ```
 */
export function useConfidentialTransferAndCall<TContext = unknown>(
  config: UseConfidentialTransferAndCallConfig,
  options?: UseMutationOptions<
    TransactionResult,
    Error,
    ConfidentialTransferAndCallParams,
    TContext
  >,
): UseMutationResult<TransactionResult, Error, ConfidentialTransferAndCallParams, TContext> {
  const token = useToken(config.address);
  const queryClient = useQueryClient();

  // Internal mutation uses `any` for TContext because optimistic mode wraps
  // the caller's context in OptimisticMutateContext; the public return type
  // is cast back to the caller's TContext.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMutation<TransactionResult, Error, ConfidentialTransferAndCallParams, any>({
    ...confidentialTransferAndCallMutationOptions(token),
    ...options,
    onMutate: config.optimistic
      ? async (variables, mutationContext) => {
          const snapshot = await applyOptimisticBalanceDelta({
            queryClient,
            tokenAddress: token.address,
            amount: variables.amount,
            mode: "subtract",
          });
          const callerContext = await options?.onMutate?.(variables, mutationContext);
          return { snapshot, callerContext };
        }
      : options?.onMutate,
    onError: (error, variables, rawContext, context) => {
      const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(
        config.optimistic,
        rawContext,
      );
      try {
        if (wrappedContext) {
          rollbackOptimisticBalanceDelta(queryClient, wrappedContext.snapshot);
        }
      } finally {
        options?.onError?.(error, variables, callerContext as TContext, context);
      }
    },
    onSuccess: (data, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
      options?.onSuccess?.(data, variables, callerContext as TContext, context);
      invalidateAfterTransfer(context.client, token.address);
    },
    onSettled: (data, error, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(config.optimistic, rawContext);
      options?.onSettled?.(data, error, variables, callerContext as TContext, context);
    },
  }) as UseMutationResult<TransactionResult, Error, ConfidentialTransferAndCallParams, TContext>;
}
