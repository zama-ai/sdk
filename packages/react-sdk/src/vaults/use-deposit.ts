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
import { invalidateAfterSetOperator } from "@zama-fhe/sdk/query";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVault } from "./use-vault";

/** Configuration for {@link useDeposit}. */
export interface UseDepositConfig {
  /** The vault, deposit batcher, and redeem batcher contract addresses. */
  addresses: VaultAddresses;
  /** Chain the vault is on. A wallet on another chain then gets `ChainMismatchError` instead of sending there. */
  chainId?: number;
}

/**
 * Deposit a plaintext amount into a vault, joining the current deposit batch.
 * Only a deposit for another `beneficiary` needs an ERC-7984 operator approval,
 * granted first if none is active. Invalidates the deposit token's balance and operator-status
 * caches on success.
 *
 * @param config - The vault's addresses, and optionally its `chainId`.
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
  const vault = useVault(config.addresses, { chainId: config.chainId });

  return useMutation({
    ...depositMutationOptions(vault),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(vault.sdk, "deposit", vault.cAsset(), (cAsset) => {
        invalidateAfterJoin(context.client, {
          batcherAddress: vault.depositBatcher.address,
          fromToken: cAsset.address,
        });
        // The mutation may have granted the batcher an operator approval.
        invalidateAfterSetOperator(context.client, cAsset.address);
      });
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, DepositParams, TContext>;
}
