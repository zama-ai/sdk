"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Address, type BatchDecryptAsOptions } from "@zama-fhe/sdk";

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
 *   credentials: delegatedCredsManager,
 * });
 * // batchDecryptAs.data => Map { "0xTokenA" => 100n, "0xTokenB" => 200n }
 * ```
 */
export function useBatchDecryptBalancesAs(
  tokens: ReadonlyToken[],
  options?: UseMutationOptions<Map<Address, bigint>, Error, BatchDecryptAsOptions>,
) {
  return useMutation<Map<Address, bigint>, Error, BatchDecryptAsOptions>({
    mutationKey: ["zama.batchDecryptBalancesAs", ...tokens.map((t) => t.address)] as const,
    mutationFn: async (params) => ReadonlyToken.batchDecryptBalancesAs(tokens, params),
    ...options,
  });
}
