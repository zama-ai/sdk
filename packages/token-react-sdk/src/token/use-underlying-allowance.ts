"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

/**
 * Query key factory for underlying ERC-20 allowance queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const underlyingAllowanceQueryKeys = {
  /** Match all underlying allowance queries. */
  all: ["underlyingAllowance"] as const,
  /** Match allowance query for a specific token + wrapper pair. */
  token: (tokenAddress: string, wrapper: string) =>
    ["underlyingAllowance", tokenAddress, wrapper] as const,
} as const;

/** Configuration for {@link useUnderlyingAllowance}. */
export interface UseUnderlyingAllowanceConfig {
  /** Address of the underlying ERC-20 token. */
  tokenAddress: Address;
  /** Address of the wrapper contract (the spender). */
  wrapperAddress: Address;
}

/**
 * Read the underlying ERC-20 allowance granted to the wrapper contract.
 * Useful to check if an approval is needed before shielding.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (current allowance).
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowance({
 *   tokenAddress: "0xUnderlying",
 *   wrapperAddress: "0xWrapper",
 * });
 * ```
 */
export function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(tokenAddress, wrapperAddress),
    queryFn: () => token.allowance(wrapperAddress),
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Suspense variant of {@link useUnderlyingAllowance}.
 * Suspends rendering until the allowance is loaded.
 *
 * @param config - Token and wrapper addresses.
 * @returns Suspense query result with `data: bigint`.
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowanceSuspense({
 *   tokenAddress: "0xUnderlying",
 *   wrapperAddress: "0xWrapper",
 * });
 * ```
 */
export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceConfig) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(tokenAddress, wrapperAddress),
    queryFn: () => token.allowance(wrapperAddress),
    staleTime: 30_000,
  });
}
