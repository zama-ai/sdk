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
