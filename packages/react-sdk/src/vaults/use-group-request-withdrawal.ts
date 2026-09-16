"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import {
  groupRequestWithdrawalMutationOptions,
  type GroupRequestWithdrawalParams,
  type VaultGroupConfig,
  type VaultGroupJoinResult,
} from "@zama-fhe/sdk/vaults";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useGroupRequestWithdrawal}. */
export interface UseGroupRequestWithdrawalConfig {
  group: VaultGroupConfig;
}

/**
 * Request a withdrawal from one vault of a group, joining every member's
 * current redeem batch with its own share token. Invalidates every member's
 * share balance on success: each leg transferred its own share token, so every
 * cached balance is stale even where the amount moved was zero.
 *
 * @param config - The group.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const withdraw = useGroupRequestWithdrawal({ group: STABLE_GROUP });
 * withdraw.mutate({ vaultId: "alpha", amount: 500_000n });
 * ```
 */
export function useGroupRequestWithdrawal<TContext = unknown>(
  config: UseGroupRequestWithdrawalConfig,
  options?: UseMutationOptions<VaultGroupJoinResult, Error, GroupRequestWithdrawalParams, TContext>,
): UseMutationResult<VaultGroupJoinResult, Error, GroupRequestWithdrawalParams, TContext> {
  const group = useVaultGroup(config.group);

  return useMutation({
    ...groupRequestWithdrawalMutationOptions(group),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      for (const member of group.vaults) {
        invalidateBalanceQueries(context.client, member.share);
      }
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupRequestWithdrawalParams, TContext>;
}
