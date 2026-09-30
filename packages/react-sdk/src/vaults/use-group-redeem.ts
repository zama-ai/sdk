"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  groupRedeemMutationOptions,
  invalidateAfterJoin,
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
 * @param config - The group. Pass a stable object: a fresh one each render
 *   rebuilds the group and its cached reads (see {@link useVaultGroup}).
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
      for (const { batcher, token } of data.joins) {
        invalidateAfterJoin(context.client, { batcherAddress: batcher, fromToken: token });
        // The mutation may have granted the router an operator approval.
        invalidateAfterSetOperator(context.client, token);
      }
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupRedeemParams, TContext>;
}
