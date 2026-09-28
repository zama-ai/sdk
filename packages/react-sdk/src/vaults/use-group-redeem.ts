"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  groupRedeemMutationOptions,
  invalidateAfterGroupJoin,
  type GroupRedeemParams,
  type VaultGroupConfig,
  type VaultGroupJoinResult,
} from "@zama-fhe/sdk/vaults";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useGroupRedeem}. */
export interface UseGroupRedeemConfig {
  /** The group to redeem from. */
  group: VaultGroupConfig;
}

/**
 * Redeem shares of one vault of a group, joining every member's current redeem
 * batch with its own share token. On success, invalidates every member's share
 * balance and operator-status caches and the batch reads of every batcher a
 * leg joined.
 *
 * @param config - The group.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const redeem = useGroupRedeem({ group: STABLE_GROUP });
 * redeem.mutate({ vaultId: "alpha", amount: 500_000n });
 * ```
 */
export function useGroupRedeem<TContext = unknown>(
  config: UseGroupRedeemConfig,
  options?: UseMutationOptions<VaultGroupJoinResult, Error, GroupRedeemParams, TContext>,
): UseMutationResult<VaultGroupJoinResult, Error, GroupRedeemParams, TContext> {
  const group = useVaultGroup(config.group);

  return useMutation({
    ...groupRedeemMutationOptions(group),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateAfterGroupJoin(context.client, {
        tokens: group.vaults.map((member) => member.cShare),
        batchers: data.joins.map((join) => join.batcher),
      });
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupRedeemParams, TContext>;
}
