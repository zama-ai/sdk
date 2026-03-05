"use client";

import { useQuery, useSuspenseQuery, skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { Address, Token } from "@zama-fhe/sdk";
import { useToken, type UseZamaConfig } from "./use-token";

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
  spender: (tokenAddress: string, spender: string, holder?: string) =>
    ["confidentialIsApproved", tokenAddress, spender, holder ?? ""] as const,
} as const;

/** Configuration for {@link useConfidentialIsApproved}. */
export interface UseConfidentialIsApprovedConfig extends UseZamaConfig {
  /** Address to check approval for. Pass `undefined` to disable the query. */
  spender: Address | undefined;
  /** Token holder address. Defaults to the connected wallet. */
  holder?: Address;
}

/** Configuration for {@link useConfidentialIsApprovedSuspense}. */
export interface UseConfidentialIsApprovedSuspenseConfig extends UseZamaConfig {
  /** Address to check approval for. */
  spender: Address;
  /** Token holder address. Defaults to the connected wallet. */
  holder?: Address;
}

/**
 * TanStack Query options factory for confidential approval check.
 *
 * @param token - A `Token` instance.
 * @param spender - Address to check approval for.
 * @param holder - Optional holder address. Defaults to the connected wallet.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function confidentialIsApprovedQueryOptions(
  token: Token,
  spender: Address,
  holder?: Address,
) {
  return {
    queryKey: confidentialIsApprovedQueryKeys.spender(token.address, spender, holder),
    queryFn: () => token.isApproved(spender, holder),
    staleTime: 30_000,
  } as const;
}

/**
 * Check if a spender is an approved operator for a given holder (defaults to connected wallet).
 *
 * @param config - Token address, spender, and optional holder to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApproved({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder", // optional
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const { spender, holder, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useQuery<boolean, Error>({
    ...(spender
      ? confidentialIsApprovedQueryOptions(token, spender, holder)
      : {
          queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, "", holder),
          queryFn: skipToken,
        }),
    ...options,
  });
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}.
 * Suspends rendering until the approval check resolves.
 *
 * @param config - Token address, spender, and optional holder to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder", // optional
 * });
 * ```
 */
export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, holder, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useSuspenseQuery<boolean, Error>(
    confidentialIsApprovedQueryOptions(token, spender, holder),
  );
}
