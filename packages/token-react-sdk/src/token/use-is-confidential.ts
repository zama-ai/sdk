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

export const isConfidentialQueryKeys = {
  all: ["isConfidential"] as const,
  token: (tokenAddress: string) => ["isConfidential", tokenAddress] as const,
} as const;

export const isWrapperQueryKeys = {
  all: ["isWrapper"] as const,
  token: (tokenAddress: string) => ["isWrapper", tokenAddress] as const,
} as const;

export function useIsConfidential(
  tokenAddress: Hex,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
): UseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean, Error>({
    queryKey: isConfidentialQueryKeys.token(tokenAddress),
    queryFn: () => token.isConfidential(),
    staleTime: Infinity,
    ...options,
  });
}

export function useIsConfidentialSuspense(
  tokenAddress: Hex,
): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: isConfidentialQueryKeys.token(tokenAddress),
    queryFn: () => token.isConfidential(),
    staleTime: Infinity,
  });
}

export function useIsWrapper(
  tokenAddress: Hex,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
): UseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean, Error>({
    queryKey: isWrapperQueryKeys.token(tokenAddress),
    queryFn: () => token.isWrapper(),
    staleTime: Infinity,
    ...options,
  });
}

export function useIsWrapperSuspense(tokenAddress: Hex): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: isWrapperQueryKeys.token(tokenAddress),
    queryFn: () => token.isWrapper(),
    staleTime: Infinity,
  });
}
