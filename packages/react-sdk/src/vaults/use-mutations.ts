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

export type UseVaultMutationOptions<TData, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, Error, TVariables, TContext>,
  "mutationKey" | "mutationFn"
>;

function useVaultMutation<TData, TVariables, TContext>(
  factory: (client: VaultClient) => MutationFactoryOptions<readonly unknown[], TVariables, TData>,
  options: UseVaultMutationOptions<TData, TVariables, TContext> | undefined,
): UseMutationResult<TData, Error, TVariables, TContext> {
  const client = useVaultClient();
  return useMutation({
    ...factory(client),
    ...options,
    // Invalidates on error too: a failed join may still have mined its approvals or the join itself.
    onSettled: (data, error, variables, onMutateResult, context) => {
      invalidateAfterVaultAction(context.client);
      return options?.onSettled?.(data, error, variables, onMutateResult, context);
    },
  });
}

/** Deposit with the SDK's signer, into a group or a vault on its own. */
export function useDeposit<TContext = unknown>(
  options?: UseVaultMutationOptions<JoinOutcome, JoinVariables, TContext>,
) {
  return useVaultMutation(depositMutationOptions, options);
}

/**
 * Redeem with the SDK's signer. For a group, the wallet is first asked for each operator approval
 * the account lacks.
 */
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

/**
 * Quit a pending or canceled batch with the SDK's signer, which must be the depositor. After a
 * group join, quit every leg of it: quitting only the chosen one shows which vault was chosen.
 */
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
