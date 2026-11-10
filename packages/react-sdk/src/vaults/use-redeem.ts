"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  invalidateAfterJoin,
  redeemMutationOptions,
  type JoinResult,
  type RedeemParams,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { invalidateAfterSetOperator } from "@zama-fhe/sdk/query";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVault } from "./use-vault";

/** Configuration for {@link useRedeem}. */
export interface UseRedeemConfig {
  /** The vault, deposit batcher, and redeem batcher contract addresses. */
  addresses: VaultAddresses;
  /** Chain the vault is on. A wallet on another chain then gets `ChainMismatchError` instead of sending there. */
  chainId?: number;
}

/**
 * Redeem shares by joining the current redeem batch with a plaintext amount of
 * shares. Only a redemption for another `beneficiary` needs an ERC-7984
 * operator approval, granted first if none is active. Invalidates the share token's balance and
 * operator-status caches on success.
 *
 * @param config - The vault's addresses, and optionally its `chainId`.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const redeem = useRedeem({ addresses });
 * redeem.mutate({ amount: 500n });
 * ```
 */
export function useRedeem<TContext = unknown>(
  config: UseRedeemConfig,
  options?: UseMutationOptions<JoinResult, Error, RedeemParams, TContext>,
): UseMutationResult<JoinResult, Error, RedeemParams, TContext> {
  const vault = useVault(config.addresses, { chainId: config.chainId });

  return useMutation({
    ...redeemMutationOptions(vault),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(vault.sdk, "redeem", vault.cShare(), (cShare) => {
        invalidateAfterJoin(context.client, {
          batcherAddress: vault.redeemBatcher.address,
          fromToken: cShare.address,
        });
        // The mutation may have granted the batcher an operator approval.
        invalidateAfterSetOperator(context.client, cShare.address);
      });
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, RedeemParams, TContext>;
}
