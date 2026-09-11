"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import {
  requestWithdrawalMutationOptions,
  type RequestWithdrawalParams,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { useVault } from "./use-vault";

/** Configuration for {@link useRequestWithdrawal}. */
export interface UseRequestWithdrawalConfig {
  /** The vault, deposit batcher, and redeem batcher contract addresses. */
  addresses: VaultAddresses;
}

/**
 * Request a withdrawal by joining the current redeem batch with a plaintext
 * amount of shares. Grants the redeem batcher an ERC-7984 operator approval
 * first if one isn't already active. Invalidates the share token's balance
 * cache on success.
 *
 * @param config - The vault's addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const requestWithdrawal = useRequestWithdrawal({ addresses });
 * requestWithdrawal.mutate({ amount: 500n });
 * ```
 */
export function useRequestWithdrawal<TContext = unknown>(
  config: UseRequestWithdrawalConfig,
  options?: UseMutationOptions<TransactionResult, Error, RequestWithdrawalParams, TContext>,
): UseMutationResult<TransactionResult, Error, RequestWithdrawalParams, TContext> {
  const vault = useVault(config.addresses);

  return useMutation({
    ...requestWithdrawalMutationOptions(vault),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const shareToken = await vault.shareToken();
      invalidateBalanceQueries(context.client, shareToken.address);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, RequestWithdrawalParams, TContext>;
}
