"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Address, ReadonlyToken } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

/**
 * Query key factory for token metadata queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const tokenMetadataQueryKeys = {
  /** Match all token metadata queries. */
  all: ["tokenMetadata"] as const,
  /** Match metadata query for a specific token. */
  token: (tokenAddress: string) => ["tokenMetadata", tokenAddress] as const,
} as const;

/** ERC-20 token metadata (name, symbol, decimals). */
export interface TokenMetadata {
  /** Human-readable token name (e.g. "Wrapped Ether"). */
  name: string;
  /** Short ticker symbol (e.g. "WETH"). */
  symbol: string;
  /** Number of decimal places (e.g. 18). */
  decimals: number;
}

/**
 * TanStack Query options factory for token metadata.
 * Returns a config object usable with `useQuery`, `prefetchQuery`, `useQueries`, etc.
 *
 * @param token - A `ReadonlyToken` instance.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 *
 * @example
 * ```ts
 * const options = tokenMetadataQueryOptions(token);
 * await queryClient.prefetchQuery(options);
 * ```
 */
export function tokenMetadataQueryOptions(token: ReadonlyToken) {
  return {
    queryKey: tokenMetadataQueryKeys.token(token.address),
    queryFn: async () => {
      const [name, symbol, decimals] = await Promise.all([
        token.name(),
        token.symbol(),
        token.decimals(),
      ]);
      return { name, symbol, decimals } as TokenMetadata;
    },
    staleTime: Infinity,
  } as const;
}

/**
 * Read ERC-20 token metadata (name, symbol, decimals).
 * Fetches all three in parallel. Cached indefinitely since metadata is immutable.
 *
 * @param tokenAddress - Address of the token contract.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: TokenMetadata`.
 *
 * @example
 * ```tsx
 * const { data: metadata } = useTokenMetadata("0xToken");
 * // metadata?.name, metadata?.symbol, metadata?.decimals
 * ```
 */
export function useTokenMetadata(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<TokenMetadata, Error>, "queryKey" | "queryFn">,
): UseQueryResult<TokenMetadata, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<TokenMetadata, Error>({
    ...tokenMetadataQueryOptions(token),
    ...options,
  });
}

/**
 * Suspense variant of {@link useTokenMetadata}.
 * Suspends rendering until metadata is loaded.
 *
 * @param tokenAddress - Address of the token contract.
 * @returns Suspense query result with `data: TokenMetadata`.
 *
 * @example
 * ```tsx
 * const { data: metadata } = useTokenMetadataSuspense("0xToken");
 * ```
 */
export function useTokenMetadataSuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<TokenMetadata, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<TokenMetadata, Error>(tokenMetadataQueryOptions(token));
}
