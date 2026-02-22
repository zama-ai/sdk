"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export interface UseWrapperDiscoveryConfig {
  tokenAddress: Address;
  coordinatorAddress: Address | undefined;
}

export interface UseWrapperDiscoverySuspenseConfig {
  tokenAddress: Address;
  coordinatorAddress: Address;
}

/**
 * Declarative hook to discover the wrapper contract for an ERC-20 token.
 * Returns the wrapper address if one exists, or `null` if not.
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<Address | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress!),
    enabled: coordinatorAddress !== undefined,
    staleTime: Infinity,
    ...options,
  });
}

export function useWrapperDiscoverySuspense(
  config: UseWrapperDiscoverySuspenseConfig,
): UseSuspenseQueryResult<Address | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Address | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress),
    staleTime: Infinity,
  });
}
