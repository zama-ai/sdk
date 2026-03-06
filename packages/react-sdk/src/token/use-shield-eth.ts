"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateAfterShield,
  shieldETHMutationOptions,
  type ShieldETHParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Shield native ETH into confidential tokens.
 * Invalidates balance caches on success.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shieldETH = useShieldETH({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * shieldETH.mutate({ amount: 1000000000000000000n }); // 1 ETH
 * ```
 */
export function useShieldETH(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ShieldETHParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ShieldETHParams, Address>({
    ...shieldETHMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterShield(context.client, config.tokenAddress);
    },
  });
}
