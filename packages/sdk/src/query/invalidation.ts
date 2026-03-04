import type { Query, QueryClient } from "@tanstack/query-core";
import { zamaQueryKeys } from "./query-keys";

function invalidateUnderlyingAllowanceQueries(queryClient: QueryClient, tokenAddress: string): void {
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
  queryClient.removeQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
}

function invalidateAfterUnwrapLike(queryClient: QueryClient, tokenAddress: string): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

export function invalidateBalanceQueries(queryClient: QueryClient, tokenAddress: string): void {
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandle.token(tokenAddress) });
  queryClient.removeQueries({ queryKey: zamaQueryKeys.confidentialHandle.token(tokenAddress) });
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandles.all });
  queryClient.resetQueries({ queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress) });
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

export function invalidateAfterShield(queryClient: QueryClient, tokenAddress: string): void {
  invalidateAfterUnwrapLike(queryClient, tokenAddress);
}

export function invalidateAfterUnshield(queryClient: QueryClient, tokenAddress: string): void {
  invalidateAfterUnwrapLike(queryClient, tokenAddress);
}

export function invalidateAfterApproveUnderlying(queryClient: QueryClient, tokenAddress: string): void {
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
}

export function invalidateAfterApprove(queryClient: QueryClient, tokenAddress: string): void {
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialIsApproved.token(tokenAddress),
  });
}

function isWagmiBalanceQuery(query: Query): boolean {
  return (
    Array.isArray(query.queryKey) &&
    query.queryKey.some((part: unknown) => {
      if (typeof part !== "object" || part === null || !("functionName" in part)) return false;
      return part.functionName === "balanceOf";
    })
  );
}

export function invalidateWagmiBalanceQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ predicate: isWagmiBalanceQuery });
}
