"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export const wrapperDiscoveryQueryKeys = {
  all: ["wrapperDiscovery"] as const,
  token: (tokenAddress: string) => ["wrapperDiscovery", tokenAddress] as const,
} as const;

export interface UseWrapperDiscoveryConfig {
  tokenAddress: Hex;
  coordinatorAddress: Hex | undefined;
}

export interface UseWrapperDiscoverySuspenseConfig {
  tokenAddress: Hex;
  coordinatorAddress: Hex;
}

/**
 * Declarative hook to discover the wrapper contract for an ERC-20 token.
 * Returns the wrapper address if one exists, or `null` if not.
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Hex | null, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Hex | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<Hex | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress!),
    enabled: coordinatorAddress !== undefined,
    staleTime: Infinity,
    ...options,
  });
}

export function useWrapperDiscoverySuspense(
  config: UseWrapperDiscoverySuspenseConfig,
): UseSuspenseQueryResult<Hex | null, Error> {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Hex | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress),
    staleTime: Infinity,
  });
}
