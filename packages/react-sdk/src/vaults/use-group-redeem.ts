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
import { invalidateAfterSetOperator } from "@zama-fhe/sdk/query";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useGroupRedeem}. */
export interface UseGroupRedeemConfig {
  /** The group to redeem from. */
  group: VaultGroupConfig;
}

/**
 * Redeem shares of one vault of a group, joining every member's current redeem
 * batch with its own share token. Grants the router an operator approval on
 * each share token first if one isn't already active, one wallet prompt per
 * grant. Invalidates the share balances, operator-status caches and the joined
 * batchers' batch reads on success.
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
      const tokens = [...new Set(data.joins.map((join) => join.token))];
      invalidateAfterGroupJoin(context.client, {
        tokens,
        batchers: data.joins.map((join) => join.batcher),
      });
      // The mutation may have granted the router an operator approval.
      for (const token of tokens) {
        invalidateAfterSetOperator(context.client, token);
      }
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupRedeemParams, TContext>;
}
