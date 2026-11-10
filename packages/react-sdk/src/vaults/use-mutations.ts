"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  invalidateAfterVaultAction,
  depositMutationOptions,
  dispatchMutationOptions,
  exitMutationOptions,
  finalizeMutationOptions,
  redeemMutationOptions,
  type ActionOutcome,
  type GroupId,
  type JoinOutcome,
  type VaultClient,
  type VaultId,
  type VaultJoinVariables,
  type VaultRecord,
  type VaultsConfig,
} from "@zama-fhe/sdk/vaults";
import type { MutationFactoryOptions } from "@zama-fhe/sdk/query";
import { useVaultClient } from "./use-vault-client";

/** Mutation options accepted by the vault mutation hooks. */
export type UseVaultMutationOptions<TData, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationKey" | "mutationFn"
>;

// Every vault mutation invalidates the reads of the group it touched.
function useVaultMutation<TConfig extends VaultsConfig, TData, TVariables, TContext>(
  config: TConfig,
  factory: (
    client: VaultClient<TConfig>,
  ) => MutationFactoryOptions<readonly unknown[], TVariables, TData>,
  options: UseVaultMutationOptions<TData, TVariables, TContext> | undefined,
): UseMutationResult<TData, Error, TVariables, TContext> {
  const client = useVaultClient(config);
  return useMutation({
    ...factory(client),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      const { groupId } = variables as { groupId: string };
      invalidateAfterVaultAction(context.client, { chainId: client.chainId, groupId });
      return options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

/**
 * Deposit with the SDK's signer. Returns the join record to store.
 *
 * @example
 * ```tsx
 * const deposit = useDeposit(VAULTS, { onSuccess: ({ record }) => save(record) });
 * deposit.mutate({ groupId: "stable", vaultId: "beta", amount: 1_000_000n });
 * ```
 */
export function useDeposit<const TConfig extends VaultsConfig, TContext = unknown>(
  config: TConfig,
  options?: UseVaultMutationOptions<
    JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>,
    VaultJoinVariables<TConfig>,
    TContext
  >,
) {
  return useVaultMutation(config, depositMutationOptions, options);
}

/** Redeem with the SDK's signer. A first redemption from a group of N vaults asks for up to N grants first. */
export function useRedeem<const TConfig extends VaultsConfig, TContext = unknown>(
  config: TConfig,
  options?: UseVaultMutationOptions<
    JoinOutcome<GroupId<TConfig>, VaultId<TConfig>>,
    VaultJoinVariables<TConfig>,
    TContext
  >,
) {
  return useVaultMutation(config, redeemMutationOptions, options);
}

/** Exit every leg of a join with the SDK's signer. Takes the join record. */
export function useExit<const TConfig extends VaultsConfig, TContext = unknown>(
  config: TConfig,
  options?: UseVaultMutationOptions<ActionOutcome, VaultRecord<TConfig>, TContext>,
) {
  return useVaultMutation(config, exitMutationOptions, options);
}

/** Dispatch every eligible leg's batch with the SDK's signer. A keeper normally does. */
export function useDispatch<const TConfig extends VaultsConfig, TContext = unknown>(
  config: TConfig,
  options?: UseVaultMutationOptions<ActionOutcome, VaultRecord<TConfig>, TContext>,
) {
  return useVaultMutation(config, dispatchMutationOptions, options);
}

/** Finalize every dispatched leg's batch with the SDK's signer. A keeper normally does. */
export function useFinalize<const TConfig extends VaultsConfig, TContext = unknown>(
  config: TConfig,
  options?: UseVaultMutationOptions<ActionOutcome, VaultRecord<TConfig>, TContext>,
) {
  return useVaultMutation(config, finalizeMutationOptions, options);
}
