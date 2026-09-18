"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  invalidateAfterJoin,
  joinMutationOptions,
  type JoinParams,
  type JoinResult,
} from "@zama-fhe/sdk/vaults";
import { invalidateOnceResolved } from "./invalidate-once-resolved";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useJoin}. */
export interface UseJoinConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
}

/**
 * Join the currently open batch on a single batcher directly. Low-level —
 * most apps should use `useDeposit` / `useRedeem` instead, which
 * also handle the operator-approval grant.
 *
 * @param config - The batcher address.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const join = useJoin({ address: "0xDepositBatcher" });
 * join.mutate({ amount: 1_000_000n });
 * ```
 */
export function useJoin<TContext = unknown>(
  config: UseJoinConfig,
  options?: UseMutationOptions<JoinResult, Error, JoinParams, TContext>,
): UseMutationResult<JoinResult, Error, JoinParams, TContext> {
  const batcher = useVaultBatcher(config.address);

  return useMutation({
    ...joinMutationOptions(batcher),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateOnceResolved(batcher.sdk, "join", batcher.fromToken(), (fromToken) =>
        invalidateAfterJoin(context.client, { batcherAddress: batcher.address, fromToken }),
      );
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  }) as UseMutationResult<JoinResult, Error, JoinParams, TContext>;
}
