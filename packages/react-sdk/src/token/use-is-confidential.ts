"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import { type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { isConfidentialQueryOptions, isWrapperQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { isConfidentialQueryOptions, isWrapperQueryOptions };

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
) {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean>({
    ...isConfidentialQueryOptions(token.signer, tokenAddress),
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
export function useIsConfidentialSuspense(tokenAddress: Address) {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean>({
    ...isConfidentialQueryOptions(token.signer, tokenAddress),
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
) {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<boolean>({
    ...isWrapperQueryOptions(token.signer, tokenAddress),
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
export function useIsWrapperSuspense(tokenAddress: Address) {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<boolean>({
    ...isWrapperQueryOptions(token.signer, tokenAddress),
  });
}
