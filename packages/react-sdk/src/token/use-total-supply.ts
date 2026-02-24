"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { totalSupplyContract, type Address, type ReadonlyToken } from "@zama-fhe/sdk";
import { useReadonlyToken } from "./use-readonly-token";

/**
 * Query key factory for total supply queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const totalSupplyQueryKeys = {
  /** Match all total supply queries. */
  all: ["totalSupply"] as const,
  /** Match total supply query for a specific token. */
  token: (tokenAddress: string) => ["totalSupply", tokenAddress] as const,
} as const;

/**
 * TanStack Query options factory for total supply.
 *
 * @param token - A `ReadonlyToken` instance.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function totalSupplyQueryOptions(token: ReadonlyToken) {
  return {
    queryKey: totalSupplyQueryKeys.token(token.address),
    queryFn: () => token.signer.readContract<bigint>(totalSupplyContract(token.address)),
    staleTime: 30_000,
  } as const;
}

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
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<bigint, Error>({
    ...totalSupplyQueryOptions(token),
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
export function useTotalSupplySuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<bigint, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<bigint, Error>(totalSupplyQueryOptions(token));
}
