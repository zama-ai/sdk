import type { Address } from "viem";
import { z } from "zod/mini";
import { zamaQueryKeys } from "./query-keys";

/** Minimal query shape read by the invalidation predicates. */
export interface QueryLike {
  /** The query's cache key. */
  queryKey: readonly unknown[];
}

/** Minimal filter shape accepted by the invalidation helpers, matching TanStack Query's `QueryFilters`. */
export interface QueryFilterLike {
  /** Match queries whose key starts with this prefix. */
  queryKey?: readonly unknown[];
  /** Match queries for which this returns `true`. */
  predicate?: (query: QueryLike) => boolean;
}

/** Minimal `QueryClient` surface used by the invalidation helpers. */
export interface QueryClientLike {
  /** Mark matching queries stale so they refetch. */
  invalidateQueries(filters: QueryFilterLike): void | Promise<void>;
  /** Remove matching queries from the cache entirely. */
  removeQueries(filters: QueryFilterLike): void;
}

function invalidateUnderlyingAllowanceQueries(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
}

function invalidatePendingUnshieldQueries(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.pendingUnshield.token(tokenAddress),
  });
}

/** Invalidates the caches affected by an unwrap: confidential balances, underlying allowance, and pending unshields. */
export function invalidateAfterUnwrap(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidates the caches affected by a wrap: confidential balances and underlying allowance. */
export function invalidateAfterWrap(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidates the confidential balance queries for a token (single-token and batched). */
export function invalidateBalanceQueries(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

/** Invalidates the caches affected by a shield: confidential balances and underlying allowance. */
export function invalidateAfterShield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidates the caches affected by an unshield request: confidential balances, underlying allowance, and pending unshields. */
export function invalidateAfterUnshield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidates the pending-unshield cache once an unshield has settled on-chain. */
export function invalidateAfterUnshieldSettled(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
}

/** Invalidates the confidential balance caches affected by a transfer. */
export function invalidateAfterTransfer(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
}

/** Invalidates the underlying-allowance cache after approving the underlying ERC-20. */
export function invalidateAfterApproveUnderlying(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
}

/** Invalidates the operator-status cache after changing a token operator. */
export function invalidateAfterSetOperator(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialIsOperator.token(tokenAddress),
  });
}

function isZamaQuery(query: QueryLike): boolean {
  return Array.isArray(query.queryKey) && typeof query.queryKey[0] === "string"
    ? query.queryKey[0].startsWith("zama.")
    : false;
}

const balanceFunctionName = z.enum(["balanceOf", "confidentialBalanceOf"]);

const balanceReadArgs = z.object({ functionName: balanceFunctionName });

const batchedReadArgs = z.object({ contracts: z.array(z.unknown()) });

function isBalanceReadPart(part: unknown): boolean {
  if (balanceReadArgs.safeParse(part).success) {
    return true;
  }
  const batched = batchedReadArgs.safeParse(part);
  return (
    batched.success && batched.data.contracts.some((c) => balanceReadArgs.safeParse(c).success)
  );
}

function isWagmiBalanceQuery(query: QueryLike): boolean {
  return Array.isArray(query.queryKey) && query.queryKey.some(isBalanceReadPart);
}

/** Invalidates any wagmi `useBalance`/`readContract` balance queries so ERC-20 balances refresh. */
export function invalidateWagmiBalanceQueries(queryClient: QueryClientLike): void {
  void queryClient.invalidateQueries({ predicate: isWagmiBalanceQuery });
}

/** Clears wallet-local caches (decryption, permits) and invalidates all Zama queries — call on wallet connect/disconnect so a stale entitlement can't leak across accounts. */
export function invalidateWalletLifecycleQueries(queryClient: QueryClientLike): void {
  // Remove (not just invalidate) wallet-local caches so a stale allowed/true
  // cannot surface between wallet disconnect and the next refetch.
  queryClient.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
  queryClient.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
  void queryClient.invalidateQueries({ predicate: isZamaQuery });
  invalidateWagmiBalanceQueries(queryClient);
}
