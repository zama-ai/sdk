"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyConfidentialToken } from "./use-readonly-confidential-token";

/**
 * Declarative hook to discover the wrapper contract for an ERC-20 token.
 * Returns the wrapper address if one exists, or `null` if not.
 */
export function useWrapperDiscovery(
  tokenAddress: Address,
  coordinatorAddress: Address | undefined,
  options?: Omit<UseQueryOptions<Address | null, Error>, "queryKey" | "queryFn">,
): UseQueryResult<Address | null, Error> {
  const token = useReadonlyConfidentialToken(tokenAddress);

  return useQuery<Address | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress!),
    enabled: coordinatorAddress !== undefined,
    staleTime: Infinity,
    ...options,
  });
}

export function useWrapperDiscoverySuspense(
  tokenAddress: Address,
  coordinatorAddress: Address,
): UseSuspenseQueryResult<Address | null, Error> {
  const token = useReadonlyConfidentialToken(tokenAddress);

  return useSuspenseQuery<Address | null, Error>({
    queryKey: ["wrapperDiscovery", tokenAddress, coordinatorAddress],
    queryFn: () => token.discoverWrapper(coordinatorAddress),
    staleTime: Infinity,
  });
}
