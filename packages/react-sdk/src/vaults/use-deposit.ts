"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import {
  depositMutationOptions,
  type DepositParams,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { useVault } from "./use-vault";

/** Configuration for {@link useDeposit}. */
export interface UseDepositConfig {
  /** The vault, deposit batcher, and redeem batcher contract addresses. */
  addresses: VaultAddresses;
}

/**
 * Deposit a plaintext amount into a vault, joining the current deposit batch.
 * Grants the deposit batcher an ERC-7984 operator approval first if one isn't
 * already active. Invalidates the deposit token's balance cache on success.
 *
 * @param config - The vault's addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const deposit = useDeposit({ addresses });
 * deposit.mutate({ amount: 1_000_000n });
 * ```
 */
export function useDeposit<TContext = unknown>(
  config: UseDepositConfig,
  options?: UseMutationOptions<TransactionResult, Error, DepositParams, TContext>,
): UseMutationResult<TransactionResult, Error, DepositParams, TContext> {
  const vault = useVault(config.addresses);

  return useMutation({
    ...depositMutationOptions(vault),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const depositToken = await vault.depositToken();
      invalidateBalanceQueries(context.client, depositToken.address);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<TransactionResult, Error, DepositParams, TContext>;
}
