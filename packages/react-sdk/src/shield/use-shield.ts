"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { shieldMutationOptions, type ShieldParams } from "@zama-fhe/sdk/query";
import { optimisticBalanceCallbacks } from "../balance/optimistic-balance-update";
import { useWrappedToken } from "../token/use-wrapped-token";

/** Configuration for {@link useShield}. */
export interface UseShieldConfig {
  /** Address of the confidential wrapper contract. */
  address: Address;
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
 * - {@link TransactionRevertedError} — approval or shield transaction reverted
 *
 * @param config - Wrapper address (and optional `optimistic` flag).
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const shield = useShield({ address: "0xWrapper", optimistic: true });
 * shield.mutate({ amount: 1000n });
 * ```
 */
export function useShield<TContext = unknown>(
  config: UseShieldConfig,
  options?: UseMutationOptions<TransactionResult, Error, ShieldParams, TContext>,
): UseMutationResult<TransactionResult, Error, ShieldParams, TContext> {
  const token = useWrappedToken(config.address);
  const queryClient = useQueryClient();

  return useMutation({
    ...shieldMutationOptions(token),
    ...options,
    ...optimisticBalanceCallbacks({
      optimistic: config.optimistic,
      tokenAddress: token.address,
      queryClient,
      options,
    }),
  }) as UseMutationResult<TransactionResult, Error, ShieldParams, TContext>;
}
