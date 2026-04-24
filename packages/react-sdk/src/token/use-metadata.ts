"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { tokenMetadataQueryOptions, type TokenMetadata } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery, useSuspenseQuery } from "../utils/query";

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
  options?: Omit<UseQueryOptions<TokenMetadata>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  return useQuery<TokenMetadata>({
    ...tokenMetadataQueryOptions(sdk, tokenAddress),
    ...options,
  });
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
  const sdk = useZamaSDK();
  return useSuspenseQuery<TokenMetadata>(tokenMetadataQueryOptions(sdk, tokenAddress));
}
