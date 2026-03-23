"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import { skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { wrapperDiscoveryQueryOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { wrapperDiscoveryQueryOptions };

/** Configuration for {@link useWrapperDiscovery}. */
export interface UseWrapperDiscoveryConfig {
  /** Address of the confidential token. */
  tokenAddress: Address;
  /** ERC-20 address to discover the wrapper for. Pass `undefined` to disable the query. */
  erc20Address: Address | undefined;
}

/** Configuration for {@link useWrapperDiscoverySuspense}. */
export interface UseWrapperDiscoverySuspenseConfig {
  /** Address of the confidential token. */
  tokenAddress: Address;
  /** ERC-20 address to discover the wrapper for. */
  erc20Address: Address;
}

/**
 * Discover the confidential wrapper for an ERC-20 token via the on-chain registry.
 * Returns the wrapper address if one exists, or `null` if not.
 * Cached indefinitely since wrapper mappings are immutable.
 *
 * @param config - Token and ERC-20 addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscovery({
 *   tokenAddress: "0xConfidentialToken",
 *   erc20Address: "0xUSDC",
 * });
 * ```
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, erc20Address } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<Address | null>({
    ...(erc20Address
      ? wrapperDiscoveryQueryOptions(token.signer, tokenAddress, { erc20Address })
      : {
          queryKey: zamaQueryKeys.wrapperDiscovery.all,
          queryFn: skipToken,
        }),
    ...options,
  });
}

/**
 * Suspense variant of {@link useWrapperDiscovery}.
 * Suspends rendering until the wrapper address is resolved.
 *
 * @param config - Token and ERC-20 addresses.
 * @returns Suspense query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscoverySuspense({
 *   tokenAddress: "0xConfidentialToken",
 *   erc20Address: "0xUSDC",
 * });
 * ```
 */
export function useWrapperDiscoverySuspense(config: UseWrapperDiscoverySuspenseConfig) {
  const { tokenAddress, erc20Address } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Address | null>({
    ...wrapperDiscoveryQueryOptions(token.signer, tokenAddress, { erc20Address }),
  });
}
