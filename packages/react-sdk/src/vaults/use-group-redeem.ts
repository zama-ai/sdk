"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { VaultGroupJoinUnconfirmedError } from "@zama-fhe/sdk";
import { invalidateAfterSetOperator } from "@zama-fhe/sdk/query";
import {
  groupRedeemMutationOptions,
  invalidateAfterJoin,
  type GroupRedeemParams,
  type VaultGroupConfig,
  type VaultGroupJoinResult,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVaultGroup } from "./use-vault-group";

/** Configuration for {@link useGroupRedeem}. */
export interface UseGroupRedeemConfig {
  /** The group to redeem from. */
  group: VaultGroupConfig;
}

/**
 * Redeem shares of one vault of a group, joining every member's current redeem
 * batch with its own share token, after granting the router an operator
 * approval on each share token that lacks one (one wallet prompt per grant).
 * Once the transaction is mined, invalidates the share balances and every
 * member's batch reads; every member's operator status is invalidated whether
 * or not the mutation succeeded.
 *
 * @param config - The group, memoized by its contents (see {@link useVaultGroup}).
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
      }
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onSettled: (data, error, variables, onMutateResult, context) => {
      // The router is all-or-nothing: a mined transaction with an unmatched log still joined every leg.
      const joinedUnconfirmed = error instanceof VaultGroupJoinUnconfirmedError;
      // Taken from the members, not `data`: a rejected prompt leaves `data` undefined but earlier grants in place.
      invalidateOnceResolved(
        group.sdk,
        "redeem",
        Promise.all(
          group.members.map(async ({ vault }) => ({
            batcher: vault.redeemBatcher.address,
            share: await vault.cShare(),
          })),
        ),
        (legs) => {
          for (const { batcher, share } of legs) {
            invalidateAfterSetOperator(context.client, share.address);
            if (joinedUnconfirmed) {
              invalidateAfterJoin(context.client, {
                batcherAddress: batcher,
                fromToken: share.address,
              });
            }
          }
        },
      );
      return options?.onSettled?.(data, error, variables, onMutateResult, context);
    },
  }) as UseMutationResult<VaultGroupJoinResult, Error, GroupRedeemParams, TContext>;
}
