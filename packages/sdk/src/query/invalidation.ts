import type { Address } from "viem";
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

export function invalidateAfterUnwrap(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}

export function invalidateBalanceQueries(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

export function invalidateAfterShield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}

export function invalidateAfterUnshield(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}

export function invalidateAfterTransfer(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}

export function invalidateAfterApproveUnderlying(
  queryClient: QueryClientLike,
  tokenAddress: Address,
): void {
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
}

export function invalidateAfterApprove(queryClient: QueryClientLike, tokenAddress: Address): void {
  void queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialIsApproved.token(tokenAddress),
  });
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}

function isZamaQuery(query: QueryLike): boolean {
  return Array.isArray(query.queryKey) && typeof query.queryKey[0] === "string"
    ? query.queryKey[0].startsWith("zama.")
    : false;
}

function isWagmiBalanceQuery(query: QueryLike): boolean {
  return (
    Array.isArray(query.queryKey) &&
    query.queryKey.some((part: unknown) => {
      if (typeof part !== "object" || part === null || !("functionName" in part)) {
        return false;
      }
      return part.functionName === "balanceOf";
    })
  );
}

export function invalidateWagmiBalanceQueries(queryClient: QueryClientLike): void {
  void queryClient.invalidateQueries({ predicate: isWagmiBalanceQuery });
}

export function invalidateWalletLifecycleQueries(queryClient: QueryClientLike): void {
  queryClient.removeQueries({ queryKey: zamaQueryKeys.signerAddress.all });
  queryClient.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
  void queryClient.invalidateQueries({ predicate: isZamaQuery });
  invalidateWagmiBalanceQueries(queryClient);
}
