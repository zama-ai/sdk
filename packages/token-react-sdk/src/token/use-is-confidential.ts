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

export function useIsConfidential(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
): UseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean, Error>({
    queryKey: ["isConfidential", tokenAddress],
    queryFn: () => token.isConfidential(),
    staleTime: Infinity,
    ...options,
  });
}

export function useIsConfidentialSuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: ["isConfidential", tokenAddress],
    queryFn: () => token.isConfidential(),
    staleTime: Infinity,
  });
}

export function useIsWrapper(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
): UseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean, Error>({
    queryKey: ["isWrapper", tokenAddress],
    queryFn: () => token.isWrapper(),
    staleTime: Infinity,
    ...options,
  });
}

export function useIsWrapperSuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: ["isWrapper", tokenAddress],
    queryFn: () => token.isWrapper(),
    staleTime: Infinity,
  });
}
