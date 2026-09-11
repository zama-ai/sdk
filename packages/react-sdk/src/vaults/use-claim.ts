"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import { claimMutationOptions, type ClaimParams } from "@zama-fhe/sdk/vaults";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useClaim}. */
export interface UseClaimConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Claim a finalized batch's output. Permissionless — anyone can call this on
 * another account's behalf; the output always goes to that account, never to
 * the caller. Invalidates the batcher's output token's balance cache on success.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const claim = useClaim({ address: "0xDepositBatcher" });
 * claim.mutate({ batchId: 7n });
 * ```
 */
export function useClaim<TContext = unknown>(
  config: UseClaimConfig,
  options?: UseMutationOptions<TransactionResult, Error, ClaimParams, TContext>,
): UseMutationResult<TransactionResult, Error, ClaimParams, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...claimMutationOptions(batcher),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const toToken = await batcher.toToken();
      invalidateBalanceQueries(context.client, toToken);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, ClaimParams, TContext>;
}
