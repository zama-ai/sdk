"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import { joinMutationOptions, type JoinParams } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useJoin}. */
export interface UseJoinConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Join the currently open batch on a single batcher directly. Low-level —
 * most apps should use `useDeposit` / `useRequestWithdrawal` instead, which
 * also handle the operator-approval grant.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const join = useJoin({ address: "0xDepositBatcher" });
 * join.mutate({ amount: 1_000_000n });
 * ```
 */
export function useJoin<TContext = unknown>(
  config: UseJoinConfig,
  options?: UseMutationOptions<TransactionResult, Error, JoinParams, TContext>,
): UseMutationResult<TransactionResult, Error, JoinParams, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...joinMutationOptions(batcher),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const fromToken = await batcher.fromToken();
      invalidateBalanceQueries(context.client, fromToken);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, JoinParams, TContext>;
}
