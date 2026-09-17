"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  depositMutationOptions,
  invalidateAfterJoin,
  type DepositParams,
  type JoinResult,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
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
  options?: UseMutationOptions<JoinResult, Error, DepositParams, TContext>,
): UseMutationResult<JoinResult, Error, DepositParams, TContext> {
  const vault = useVault(config.addresses);

  return useMutation({
    ...depositMutationOptions(vault),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(vault.sdk, "deposit", vault.cAsset(), (cAsset) =>
        invalidateAfterJoin(context.client, {
          batcherAddress: vault.depositBatcher.address,
          fromToken: cAsset.address,
        }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, DepositParams, TContext>;
}
