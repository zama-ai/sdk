"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  invalidateAfterJoin,
  requestRedeemMutationOptions,
  type JoinResult,
  type RequestRedeemParams,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVault } from "./use-vault";

/** Configuration for {@link useRequestRedeem}. */
export interface UseRequestRedeemConfig {
  /** The vault, deposit batcher, and redeem batcher contract addresses. */
  addresses: VaultAddresses;
}

/**
 * Redeem shares by joining the current redeem batch with a plaintext amount of
 * shares. Grants the redeem batcher an ERC-7984 operator approval first if one
 * isn't already active. Invalidates the share token's balance cache on success.
 *
 * @param config - The vault's addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const requestRedeem = useRequestRedeem({ addresses });
 * requestRedeem.mutate({ amount: 500n });
 * ```
 */
export function useRequestRedeem<TContext = unknown>(
  config: UseRequestRedeemConfig,
  options?: UseMutationOptions<JoinResult, Error, RequestRedeemParams, TContext>,
): UseMutationResult<JoinResult, Error, RequestRedeemParams, TContext> {
  const vault = useVault(config.addresses);

  return useMutation({
    ...requestRedeemMutationOptions(vault),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(vault.sdk, "requestRedeem", vault.cShare(), (cShare) =>
        invalidateAfterJoin(context.client, {
          batcherAddress: vault.redeemBatcher.address,
          fromToken: cShare.address,
        }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, RequestRedeemParams, TContext>;
}
