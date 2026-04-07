"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { totalSupplyQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { totalSupplyQueryOptions };

/**
 * Read the total supply of a token.
 * Stale after 30 seconds to balance freshness and RPC cost.
 *
 * @param tokenAddress - Address of the token contract.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint`.
 *
 * @example
 * ```tsx
 * const { data: totalSupply } = useTotalSupply("0xToken");
 * ```
 */
export function useTotalSupply(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn">,
) {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<bigint>({
    ...totalSupplyQueryOptions(token.signer, tokenAddress),
    ...options,
  });
}

/**
 * Suspense variant of {@link useTotalSupply}.
 * Suspends rendering until the total supply is loaded.
 *
 * @param tokenAddress - Address of the token contract.
 * @returns Suspense query result with `data: bigint`.
 *
 * @example
 * ```tsx
 * const { data: totalSupply } = useTotalSupplySuspense("0xToken");
 * ```
 */
export function useTotalSupplySuspense(tokenAddress: Address) {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<bigint>(totalSupplyQueryOptions(token.signer, tokenAddress));
}
