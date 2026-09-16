"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  invalidateAfterJoin,
  type JoinResult,
  requestWithdrawalMutationOptions,
  type RequestWithdrawalParams,
  type VaultAddresses,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
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
  options?: UseMutationOptions<JoinResult, Error, RequestWithdrawalParams, TContext>,
): UseMutationResult<JoinResult, Error, RequestWithdrawalParams, TContext> {
  const vault = useVault(config.addresses);

  return useMutation({
    ...requestWithdrawalMutationOptions(vault),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(vault.sdk, "requestWithdrawal", vault.shareToken(), (shareToken) =>
        invalidateAfterJoin(context.client, {
          batcherAddress: vault.redeemBatcher.address,
          fromToken: shareToken.address,
        }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, RequestWithdrawalParams, TContext>;
}
