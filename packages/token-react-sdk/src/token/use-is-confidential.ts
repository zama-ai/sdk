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

/**
 * Query key factory for ERC-165 confidential interface checks.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const isConfidentialQueryKeys = {
  /** Match all confidential interface queries. */
  all: ["isConfidential"] as const,
  /** Match confidential interface query for a specific token. */
  token: (tokenAddress: string) => ["isConfidential", tokenAddress] as const,
} as const;

/**
 * Query key factory for ERC-165 wrapper interface checks.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const isWrapperQueryKeys = {
  /** Match all wrapper interface queries. */
  all: ["isWrapper"] as const,
  /** Match wrapper interface query for a specific token. */
  token: (tokenAddress: string) => ["isWrapper", tokenAddress] as const,
} as const;

/**
 * Check if a token supports the ERC-7984 confidential interface via ERC-165.
 * Result is cached indefinitely since interface support does not change.
 *
 * @param tokenAddress - Address of the token contract to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isConfidential } = useIsConfidential("0xToken");
 * ```
 */
export function useIsConfidential(
  tokenAddress: Address,
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

/**
 * Suspense variant of {@link useIsConfidential}.
 * Suspends rendering until the ERC-165 check resolves.
 *
 * @param tokenAddress - Address of the token contract to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isConfidential } = useIsConfidentialSuspense("0xToken");
 * ```
 */
export function useIsConfidentialSuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: isConfidentialQueryKeys.token(tokenAddress),
    queryFn: () => token.isConfidential(),
    staleTime: Infinity,
  });
}

/**
 * Check if a token supports the ERC-7984 wrapper interface via ERC-165.
 * Result is cached indefinitely since interface support does not change.
 *
 * @param tokenAddress - Address of the token contract to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isWrapper } = useIsWrapper("0xToken");
 * ```
 */
export function useIsWrapper(
  tokenAddress: Address,
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

/**
 * Suspense variant of {@link useIsWrapper}.
 * Suspends rendering until the ERC-165 check resolves.
 *
 * @param tokenAddress - Address of the token contract to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isWrapper } = useIsWrapperSuspense("0xToken");
 * ```
 */
export function useIsWrapperSuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<boolean, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean, Error>({
    queryKey: isWrapperQueryKeys.token(tokenAddress),
    queryFn: () => token.isWrapper(),
    staleTime: Infinity,
  });
}
