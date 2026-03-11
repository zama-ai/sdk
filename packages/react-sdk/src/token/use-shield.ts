"use client";

import { useMutation, useQueryClient, UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import { shieldMutationOptions, type ShieldParams } from "@zama-fhe/sdk/query";
import { optimisticBalanceCallbacks } from "./optimistic-balance-update";
import { useToken, type UseZamaConfig } from "./use-token";

/** Configuration for {@link useShield}. */
export interface UseShieldConfig extends UseZamaConfig {
  /**
   * When `true`, optimistically adds the wrap amount to the cached confidential balance
   * before the transaction confirms. Rolls back on error.
   * @defaultValue false
   */
  optimistic?: boolean;
}

/**
 * Shield public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically. Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link ApprovalFailedError} — ERC-20 approval transaction failed
 * - {@link TransactionRevertedError} — shield transaction reverted
 *
 * @param config - Token and wrapper addresses.
 *   Set `optimistic: true` to add the amount to the cached balance immediately.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shield = useShield({ tokenAddress: "0x...", wrapperAddress: "0x...", optimistic: true });
 * shield.mutate({ amount: 1000n });
 * ```
 */
export function useShield(
  config: UseShieldConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: UseMutationOptions<TransactionResult, Error, ShieldParams, any>,
) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation({
    ...shieldMutationOptions(token),
    ...options,
    ...optimisticBalanceCallbacks({
      optimistic: config.optimistic,
      tokenAddress: config.tokenAddress,
      queryClient,
      options,
    }),
  });
}
