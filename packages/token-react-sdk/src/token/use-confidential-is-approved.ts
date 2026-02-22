"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

/**
 * Query key factory for confidential approval queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const confidentialIsApprovedQueryKeys = {
  /** Match all approval queries. */
  all: ["confidentialIsApproved"] as const,
  /** Match approval queries for a specific token. */
  token: (tokenAddress: string) => ["confidentialIsApproved", tokenAddress] as const,
  /** Match approval queries for a specific token + spender pair. */
  spender: (tokenAddress: string, spender: string) =>
    ["confidentialIsApproved", tokenAddress, spender] as const,
} as const;

/** Configuration for {@link useConfidentialIsApproved}. */
export interface UseConfidentialIsApprovedConfig extends UseTokenConfig {
  /** Address to check approval for. Pass `undefined` to disable the query. */
  spender: Address | undefined;
}

/** Configuration for {@link useConfidentialIsApprovedSuspense}. */
export interface UseConfidentialIsApprovedSuspenseConfig extends UseTokenConfig {
  /** Address to check approval for. */
  spender: Address;
}

/**
 * Check if a spender is an approved operator for the connected wallet.
 *
 * @param config - Token address and spender to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApproved({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useQuery<boolean, Error>({
    queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, spender ?? ""),
    queryFn: () => token.isApproved(spender as Address),
    enabled: !!spender,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}.
 * Suspends rendering until the approval check resolves.
 *
 * @param config - Token address and spender to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 * });
 * ```
 */
export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useSuspenseQuery<boolean, Error>({
    queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, spender),
    queryFn: () => token.isApproved(spender),
    staleTime: 30_000,
  });
}
