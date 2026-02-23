"use client";

import {
  useQuery,
  useSuspenseQuery,
  skipToken,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Address, ReadonlyToken } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

/**
 * Query key factory for wrapper discovery queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const wrapperDiscoveryQueryKeys = {
  /** Match all wrapper discovery queries. */
  all: ["wrapperDiscovery"] as const,
  /** Match wrapper discovery queries for a specific token. */
  token: (tokenAddress: string) => ["wrapperDiscovery", tokenAddress] as const,
  /** Match wrapper discovery query for a specific token + coordinator pair. */
  tokenCoordinator: (tokenAddress: string, coordinatorAddress: string) =>
    ["wrapperDiscovery", tokenAddress, coordinatorAddress] as const,
} as const;

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
 * TanStack Query options factory for wrapper discovery.
 *
 * @param token - A `ReadonlyToken` instance.
 * @param coordinatorAddress - Address of the wrapper coordinator.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function wrapperDiscoveryQueryOptions(token: ReadonlyToken, coordinatorAddress: Address) {
  return {
    queryKey: wrapperDiscoveryQueryKeys.tokenCoordinator(token.address, coordinatorAddress),
    queryFn: () => token.discoverWrapper(coordinatorAddress),
    staleTime: Infinity,
  } as const;
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
): UseQueryResult<Address | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<Address | null, Error>({
    ...(coordinatorAddress
      ? wrapperDiscoveryQueryOptions(token, coordinatorAddress)
      : {
          queryKey: wrapperDiscoveryQueryKeys.tokenCoordinator(tokenAddress, ""),
          queryFn: skipToken,
        }),
    ...options,
  });
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
export function useWrapperDiscoverySuspense(
  config: UseWrapperDiscoverySuspenseConfig,
): UseSuspenseQueryResult<Address | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Address | null, Error>(
    wrapperDiscoveryQueryOptions(token, coordinatorAddress),
  );
}
