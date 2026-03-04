"use client";

import { useQuery, useSuspenseQuery, skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { hashFn, wrapperDiscoveryQueryOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export const wrapperDiscoveryQueryKeys = zamaQueryKeys.wrapperDiscovery;
export { wrapperDiscoveryQueryOptions };

/** Configuration for {@link useWrapperDiscovery}. */
export interface UseWrapperDiscoveryConfig {
  /** Address of the underlying ERC-20 token. */
  tokenAddress: Address;
  /** Address of the wrapper coordinator. Pass `undefined` to disable the query. */
  coordinatorAddress: Address | undefined;
}

/** Configuration for {@link useWrapperDiscoverySuspense}. */
export interface UseWrapperDiscoverySuspenseConfig {
  /** Address of the underlying ERC-20 token. */
  tokenAddress: Address;
  /** Address of the wrapper coordinator. */
  coordinatorAddress: Address;
}

/**
 * Discover the wrapper contract for an ERC-20 token.
 * Returns the wrapper address if one exists, or `null` if not.
 * Cached indefinitely since wrapper mappings are immutable.
 *
 * @param config - Token and coordinator addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscovery({
 *   tokenAddress: "0xUnderlying",
 *   coordinatorAddress: "0xCoordinator",
 * });
 * ```
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null, Error>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery({
    ...(coordinatorAddress
      ? wrapperDiscoveryQueryOptions(token.signer, tokenAddress, { coordinatorAddress })
      : {
          queryKey: wrapperDiscoveryQueryKeys.token(tokenAddress),
          queryFn: skipToken,
        }),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<Address | null, Error>);
}

/**
 * Suspense variant of {@link useWrapperDiscovery}.
 * Suspends rendering until the wrapper address is resolved.
 *
 * @param config - Token and coordinator addresses.
 * @returns Suspense query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscoverySuspense({
 *   tokenAddress: "0xUnderlying",
 *   coordinatorAddress: "0xCoordinator",
 * });
 * ```
 */
export function useWrapperDiscoverySuspense(config: UseWrapperDiscoverySuspenseConfig) {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery({
    ...wrapperDiscoveryQueryOptions(token.signer, tokenAddress, { coordinatorAddress }),
    queryKeyHashFn: hashFn,
  });
}
