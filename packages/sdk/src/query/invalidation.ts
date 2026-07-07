import type { Address } from "viem";
import { z } from "zod/mini";
import { zamaQueryKeys } from "./query-keys";

export interface QueryLike {
  queryKey: readonly unknown[];
}

export interface QueryFilterLike {
  queryKey?: readonly unknown[];
  predicate?: (query: QueryLike) => boolean;
}

export interface QueryClientLike {
  invalidateQueries(filters: QueryFilterLike): void | Promise<void>;
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

export function invalidateAfterUnwrap(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

export function invalidateBalanceQueries(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

export function invalidateAfterShield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

export function invalidateAfterUnshield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

export function invalidateAfterUnshieldSettled(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  invalidatePendingUnshieldQueries(queryClient, tokenAddress);
}

export function invalidateAfterTransfer(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
}

export function invalidateAfterApproveUnderlying(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
}

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

export function invalidateWagmiBalanceQueries(queryClient: QueryClientLike): void {
  void queryClient.invalidateQueries({ predicate: isWagmiBalanceQuery });
}

export function invalidateWalletLifecycleQueries(queryClient: QueryClientLike): void {
  // Remove (not just invalidate) wallet-local caches so a stale allowed/true
  // cannot surface between wallet disconnect and the next refetch.
  queryClient.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
  queryClient.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
  void queryClient.invalidateQueries({ predicate: isZamaQuery });
  invalidateWagmiBalanceQueries(queryClient);
}
