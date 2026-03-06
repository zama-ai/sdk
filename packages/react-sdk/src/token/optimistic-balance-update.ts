import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";

type BalanceDeltaMode = "add" | "subtract";
export type OptimisticBalanceSnapshot = Array<[QueryKey, bigint | undefined]>;

/** Combined context returned by optimistic `onMutate`. */
export interface OptimisticMutateContext {
  snapshot: OptimisticBalanceSnapshot;
  callerContext?: unknown;
}

export function unwrapOptimisticCallerContext(
  optimistic: boolean | undefined,
  rawContext: OptimisticMutateContext | undefined,
) {
  const wrappedContext = optimistic ? rawContext : undefined;
  const callerContext = optimistic ? wrappedContext?.callerContext : rawContext;
  return { wrappedContext, callerContext };
}

export async function applyOptimisticBalanceDelta(
  queryClient: QueryClient,
  tokenAddress: Address,
  amount: bigint,
  mode: BalanceDeltaMode,
): Promise<OptimisticBalanceSnapshot> {
  const balanceKey = zamaQueryKeys.confidentialBalance.token(tokenAddress);
  await queryClient.cancelQueries({ queryKey: balanceKey });
  const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
  for (const [key, value] of previous) {
    if (value === undefined) continue;
    // Temporary optimistic underflow (`amount > value`) is acceptable because
    // settlement invalidates and rewrites this cache entry.
    queryClient.setQueryData(key, mode === "add" ? value + amount : value - amount);
  }
  return previous;
}

export function rollbackOptimisticBalanceDelta(
  queryClient: QueryClient,
  snapshot: OptimisticBalanceSnapshot,
) {
  for (const [key, value] of snapshot) {
    queryClient.setQueryData(key, value);
  }
}
