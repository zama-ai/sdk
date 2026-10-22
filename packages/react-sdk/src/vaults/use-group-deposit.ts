"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  groupDepositMutationOptions,
  invalidateAfterJoin,
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
 * batch. Invalidates the asset's balance and the joined batchers' batch reads
 * on success.
 *
 * @param config - The group. Pass a stable object: a fresh one each render
 *   rebuilds the group and its cached reads (see {@link useVaultGroup}).
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
    onSuccess: (data, variables, onMutateResult, context) => {
      for (const { batcher, token } of data.joins) {
        invalidateAfterJoin(context.client, { batcherAddress: batcher, fromToken: token });
      }
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupDepositParams, TContext>;
}
