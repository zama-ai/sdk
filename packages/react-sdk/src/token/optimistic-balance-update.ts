import type { QueryClient, QueryKey, UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateAfterShield, zamaQueryKeys } from "@zama-fhe/sdk/query";

type BalanceDeltaMode = "add" | "subtract";
export type OptimisticBalanceSnapshot = Array<[QueryKey, bigint | undefined]>;

/** Combined context returned by optimistic `onMutate`. */
export interface OptimisticMutateContext {
  snapshot: OptimisticBalanceSnapshot;
  callerContext?: unknown;
}

export function unwrapOptimisticCallerContext(
  optimistic: boolean | undefined,
  rawContext: unknown,
): {
  wrappedContext: OptimisticMutateContext | undefined;
  callerContext: OptimisticMutateContext | undefined;
} {
  const typed = rawContext as OptimisticMutateContext | undefined;
  const wrappedContext = optimistic ? typed : undefined;
  const callerContext = (optimistic ? wrappedContext?.callerContext : rawContext) as
    | OptimisticMutateContext
    | undefined;
  return { wrappedContext, callerContext };
}

export async function applyOptimisticBalanceDelta({
  queryClient,
  tokenAddress,
  amount,
  mode,
}: {
  queryClient: QueryClient;
  tokenAddress: Address;
  amount: bigint;
  mode: BalanceDeltaMode;
}): Promise<OptimisticBalanceSnapshot> {
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

/**
 * Build optimistic mutation callbacks for shield operations.
 * Wraps the caller's `onMutate`/`onError`/`onSuccess`/`onSettled` with snapshot/rollback logic
 * and returns overrides ready to spread into `useMutation`.
 */
export function optimisticBalanceCallbacks<TParams extends { amount: bigint }>({
  optimistic,
  tokenAddress,
  queryClient,
  options,
}: {
  optimistic: boolean | undefined;
  tokenAddress: Address;
  queryClient: QueryClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: UseMutationOptions<TransactionResult, Error, TParams, any> | undefined;
}): Pick<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  UseMutationOptions<TransactionResult, Error, TParams, any>,
  "onMutate" | "onError" | "onSuccess" | "onSettled"
> {
  return {
    onMutate: optimistic
      ? async (variables, mutationContext) => {
          const snapshot = await applyOptimisticBalanceDelta({
            queryClient,
            tokenAddress,
            amount: variables.amount,
            mode: "add",
          });
          const callerContext = await options?.onMutate?.(variables, mutationContext);
          return { snapshot, callerContext };
        }
      : options?.onMutate,
    onError: (error, variables, rawContext, context) => {
      const { wrappedContext, callerContext } = unwrapOptimisticCallerContext(
        optimistic,
        rawContext,
      );
      if (wrappedContext) {
        rollbackOptimisticBalanceDelta(queryClient, wrappedContext.snapshot);
      }
      options?.onError?.(error, variables, callerContext, context);
    },
    onSuccess: (data, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(optimistic, rawContext);
      options?.onSuccess?.(data, variables, callerContext!, context);
      invalidateAfterShield(context.client, tokenAddress);
    },
    onSettled: (data, error, variables, rawContext, context) => {
      const { callerContext } = unwrapOptimisticCallerContext(optimistic, rawContext);
      options?.onSettled?.(data, error, variables, callerContext, context);
    },
  };
}
