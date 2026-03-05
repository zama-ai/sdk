"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { hashFn, tokenMetadataQueryOptions, type TokenMetadata } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { type TokenMetadata };

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
 * const { data: metadata } = useMetadata("0xToken");
 * // metadata?.name, metadata?.symbol, metadata?.decimals
 * ```
 */
export function useMetadata(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<TokenMetadata, Error>, "queryKey" | "queryFn">,
) {
  const token = useReadonlyToken(tokenAddress);

  return useQuery({
    ...tokenMetadataQueryOptions(token.signer, tokenAddress),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<TokenMetadata, Error>);
}

/**
 * Suspense variant of {@link useMetadata}.
 * Suspends rendering until metadata is loaded.
 *
 * @param tokenAddress - Address of the token contract.
 * @returns Suspense query result with `data: TokenMetadata`.
 *
 * @example
 * ```tsx
 * const { data: metadata } = useMetadataSuspense("0xToken");
 * ```
 */
export function useMetadataSuspense(tokenAddress: Address) {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery({
    ...tokenMetadataQueryOptions(token.signer, tokenAddress),
    queryKeyHashFn: hashFn,
  });
}
