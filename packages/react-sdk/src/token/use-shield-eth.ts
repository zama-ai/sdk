"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { shieldETHMutationOptions, type ShieldETHParams } from "@zama-fhe/sdk/query";
import {
  type OptimisticMutateContext,
  optimisticShieldCallbacks,
} from "./optimistic-balance-update";
import { useToken, type UseZamaConfig } from "./use-token";

/** Configuration for {@link useShieldETH}. */
export interface UseShieldETHConfig extends UseZamaConfig {
  /**
   * When `true`, optimistically adds the wrap amount to the cached confidential balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Shield native ETH into confidential tokens.
 * Handles wrapping automatically. Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link TransactionRevertedError} — shield transaction reverted
 *
 * @param config - Token and wrapper addresses.
 *   Set `optimistic: true` to add the amount to the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shieldETH = useShieldETH({ tokenAddress: "0x...", wrapperAddress: "0x...", optimistic: true });
 * shieldETH.mutate({ amount: 1000000000000000000n }); // 1 ETH
 * ```
 */
export function useShieldETH(
  config: UseShieldETHConfig,
  options?: UseMutationOptions<TransactionResult, Error, ShieldETHParams, OptimisticMutateContext>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation<TransactionResult, Error, ShieldETHParams, OptimisticMutateContext>({
    ...shieldETHMutationOptions(token),
    ...options,
    ...optimisticShieldCallbacks(config.optimistic, config.tokenAddress, queryClient, options),
  });
}
