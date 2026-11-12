"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { MutationFactoryOptions } from "@zama-fhe/sdk/query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  claimMutationOptions,
  depositMutationOptions,
  dispatchMutationOptions,
  finalizeMutationOptions,
  invalidateAfterVaultAction,
  quitMutationOptions,
  redeemMutationOptions,
  type BatchRef,
  type BatcherRef,
  type JoinOutcome,
  type JoinVariables,
  type VaultClient,
} from "@zama-fhe/sdk/vaults";
import type { Address } from "viem";
import { useVaultClient } from "./use-vault-client";

/** Mutation options accepted by the vault mutation hooks. */
export type UseVaultMutationOptions<TData, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationKey" | "mutationFn"
>;

// Every vault mutation invalidates the vault reads and balances it may have changed, on error too:
// a join that mined but could not be confirmed, or operator approvals mined before a failed join, changed state.
function useVaultMutation<TData, TVariables, TContext>(
  factory: (client: VaultClient) => MutationFactoryOptions<readonly unknown[], TVariables, TData>,
  options: UseVaultMutationOptions<TData, TVariables, TContext> | undefined,
): UseMutationResult<TData, Error, TVariables, TContext> {
  const client = useVaultClient();
  return useMutation({
    ...factory(client),
    ...options,
    onSettled: (data, error, variables, onMutateResult, context) => {
      invalidateAfterVaultAction(context.client);
      return options?.onSettled?.(data, error, variables, onMutateResult, context);
    },
  });
}

/**
 * Deposit with the SDK's signer, into a group or a vault on its own. Returns
 * the batch each leg landed in.
 *
 * @example
 * ```tsx
 * const deposit = useDeposit({ onSuccess: ({ batches }) => save(batches) });
 * deposit.mutate({ group: STABLE, vaultId: "beta", amount: 1_000_000n });
 * ```
 */
export function useDeposit<TContext = unknown>(
  options?: UseVaultMutationOptions<JoinOutcome, JoinVariables, TContext>,
) {
  return useVaultMutation(depositMutationOptions, options);
}

/** Redeem with the SDK's signer. In a group of several vaults, the wallet is first asked for each operator approval the account lacks. */
export function useRedeem<TContext = unknown>(
  options?: UseVaultMutationOptions<JoinOutcome, JoinVariables, TContext>,
) {
  return useVaultMutation(redeemMutationOptions, options);
}

/** Claim a finalized batch with the SDK's signer, for `account` (default: the signer). */
export function useClaim<TContext = unknown>(
  options?: UseVaultMutationOptions<
    TransactionResult,
    BatchRef & { readonly account?: Address },
    TContext
  >,
) {
  return useVaultMutation(claimMutationOptions, options);
}

/** Quit a pending or canceled batch with the SDK's signer, which must be the depositor. */
export function useQuit<TContext = unknown>(
  options?: UseVaultMutationOptions<TransactionResult, BatchRef, TContext>,
) {
  return useVaultMutation(quitMutationOptions, options);
}

/** Dispatch a batcher's open batch with the SDK's signer. */
export function useDispatch<TContext = unknown>(
  options?: UseVaultMutationOptions<TransactionResult, BatcherRef, TContext>,
) {
  return useVaultMutation(dispatchMutationOptions, options);
}

/** Finalize a dispatched batch with the SDK's signer. */
export function useFinalize<TContext = unknown>(
  options?: UseVaultMutationOptions<TransactionResult, BatchRef, TContext>,
) {
  return useVaultMutation(finalizeMutationOptions, options);
}
