"use client";

import {
  useMutation,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { VaultGroupJoinUnconfirmedError } from "@zama-fhe/sdk";
import { invalidateBalanceQueries } from "@zama-fhe/sdk/query";
import {
  groupDepositMutationOptions,
  invalidateBatchQueries,
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
 * batch. Invalidates the asset's balance and every member's batch reads once
 * the transaction is mined, whether or not every `Joined` log was matched.
 *
 * @param config - The group, memoized by its contents (see {@link useVaultGroup}).
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

  const invalidateJoins = (client: QueryClient) => {
    invalidateBalanceQueries(client, group.cAsset);
    for (const { vault } of group.members) {
      invalidateBatchQueries(client, vault.depositBatcher.address);
    }
  };

  return useMutation({
    ...groupDepositMutationOptions(group),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateJoins(context.client);
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onSettled: (data, error, variables, onMutateResult, context) => {
      // The router is all-or-nothing: a mined transaction with an unmatched log still joined every leg.
      if (error instanceof VaultGroupJoinUnconfirmedError) {
        invalidateJoins(context.client);
      }
      return options?.onSettled?.(data, error, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupDepositParams, TContext>;
}
