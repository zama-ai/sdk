import { Query } from "@tanstack/react-query";
import { Address } from "@zama-fhe/sdk";

/**
 * Query key factories for confidential balance queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()` / `removeQueries()`.
 *
 * @example
 * ```ts
 * // Invalidate all balance queries
 * queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });
 *
 * // Reset balance for a specific token + owner
 * queryClient.resetQueries({
 *   queryKey: confidentialBalanceQueryKeys.owner("0xToken", "0xOwner"),
 * });
 * ```
 */
export const confidentialBalanceQueryKeys = {
  /** Match all single-token balance queries. */
  all: ["confidentialBalance"] as const,
  /** Match balance queries for a specific token (any owner). */
  token: (tokenAddress: string) => ["confidentialBalance", tokenAddress] as const,
  /** Match balance query for a specific token + owner. */
  owner: (tokenAddress: string, owner: string) =>
    ["confidentialBalance", tokenAddress, owner] as const,
} as const;

/**
 * Query key factory for batch balance queries (multiple tokens).
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const confidentialBalancesQueryKeys = {
  /** Match all batch balance queries. */
  all: ["confidentialBalances"] as const,
  /** Match batch balance query for a specific token set + owner. */
  tokens: (tokenAddresses: string[], owner: string) =>
    ["confidentialBalances", tokenAddresses, owner] as const,
} as const;

/**
 * Query key factory for encrypted handle queries (Phase 1 of two-phase polling).
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const confidentialHandleQueryKeys = {
  /** Match all single-token handle queries. */
  all: ["confidentialHandle"] as const,
  /** Match handle queries for a specific token (any owner). */
  token: (tokenAddress: string) => ["confidentialHandle", tokenAddress] as const,
  /** Match handle query for a specific token + owner. */
  owner: (tokenAddress: string, owner: string) =>
    ["confidentialHandle", tokenAddress, owner] as const,
} as const;

/**
 * Query key factory for batch encrypted handle queries (Phase 1, multiple tokens).
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const confidentialHandlesQueryKeys = {
  /** Match all batch handle queries. */
  all: ["confidentialHandles"] as const,
  /** Match batch handle query for a specific token set + owner. */
  tokens: (tokenAddresses: string[], owner: string) =>
    ["confidentialHandles", tokenAddresses, owner] as const,
} as const;

/**
 * Query key matching wagmi's `useBalance` cache (`['balance', ...]`).
 * Invalidate after operations that change the underlying ERC-20 balance
 * (e.g. unshield, finalize unwrap) so wagmi refetches automatically.
 *
 * Requires the app to share the same `QueryClient` between wagmi and `TokenSDKProvider`.
 */
export const wagmiBalancePredicates = {
  /** Match all wagmi balance queries. */
  balanceOf: (query: Query) =>
    Array.isArray(query.queryKey) &&
    query.queryKey.some(
      (key) =>
        typeof key === "object" &&
        key !== null &&
        "functionName" in key &&
        key.functionName === "balanceOf",
    ),
  balanceOfAddress: (address: Address) => (query: Query) =>
    query.queryKey[0] === "readContracts" &&
    typeof query.queryKey[1] === "object" &&
    query.queryKey[1] !== null &&
    "contracts" in query.queryKey[1] &&
    Array.isArray(query.queryKey[1].contracts) &&
    query.queryKey[1].contracts.some(
      (c) => c.address === address && c.functionName === "balanceOf",
    ),
} as const;
