"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address, ReadonlyToken } from "@zama-fhe/sdk";
import {
  batchDecryptBalancesAsMutationOptions,
  type BatchDecryptBalancesAsParams,
} from "@zama-fhe/sdk/query";

/**
 * Batch decrypt confidential balances as a delegate across multiple tokens.
 *
 * @param tokens - ReadonlyToken instances to decrypt balances for.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const batchDecryptAs = useBatchDecryptBalancesAs(tokens);
 * batchDecryptAs.mutate({
 *   delegatorAddress: "0xDelegator",
 * });
 * // batchDecryptAs.data => Map { "0xTokenA" => 100n, "0xTokenB" => 200n }
 * ```
 */
export function useBatchDecryptBalancesAs(
  tokens: ReadonlyToken[],
  options?: UseMutationOptions<Map<Address, bigint>, Error, BatchDecryptBalancesAsParams>,
) {
  return useMutation<Map<Address, bigint>, Error, BatchDecryptBalancesAsParams>({
    ...batchDecryptBalancesAsMutationOptions(tokens),
    ...options,
  });
}
