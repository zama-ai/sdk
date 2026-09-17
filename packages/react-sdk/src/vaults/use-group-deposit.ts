"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import {
  groupDepositMutationOptions,
  type GroupDepositParams,
  type VaultGroupConfig,
  type VaultGroupJoinResult,
} from "@zama-fhe/sdk/vaults";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useGroupDeposit}. */
export interface UseGroupDepositConfig {
  /** The group to deposit into. */
  group: VaultGroupConfig;
}

/**
 * Deposit into one vault of a group, joining every member's current deposit
 * batch. Invalidates the shared asset's balance cache on success.
 *
 * @param config - The group.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const deposit = useGroupDeposit({ group: STABLE_GROUP });
 * deposit.mutate({ vaultId: "alpha", amount: 1_000_000n });
 * ```
 */
export function useGroupDeposit<TContext = unknown>(
  config: UseGroupDepositConfig,
  options?: UseMutationOptions<VaultGroupJoinResult, Error, GroupDepositParams, TContext>,
): UseMutationResult<VaultGroupJoinResult, Error, GroupDepositParams, TContext> {
  const group = useVaultGroup(config.group);

  return useMutation({
    ...groupDepositMutationOptions(group),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      invalidateBalanceQueries(context.client, group.asset);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupDepositParams, TContext>;
}
