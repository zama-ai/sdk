import type {
  MutationFunctionContext,
  QueryKey,
  QueryObserverOptions,
  skipToken,
} from "@tanstack/query-core";

/**
 * TanStack Query options object returned by the SDK's `*QueryOptions` factories:
 * `QueryObserverOptions` with `queryKey` and `queryFn` required and the
 * cache-internal keys (`queryHash`, `queryKeyHashFn`, `throwOnError`) removed.
 */
export type QueryFactoryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  Omit<QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, "queryKey"> &
    Required<
      Pick<QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, "queryKey">
    >,
  "queryFn" | "queryHash" | "queryKeyHashFn" | "throwOnError"
> & {
  queryFn: Exclude<
    QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>["queryFn"],
    typeof skipToken | undefined
  >;
};

/** TanStack Query mutation options object returned by the SDK's `*MutationOptions` factories. */
export interface MutationFactoryOptions<
  TMutationKey extends readonly unknown[],
  TVariables,
  TData,
  TOnMutateResult = unknown,
> {
  /** Cache key identifying the mutation. */
  mutationKey: TMutationKey;
  /** Runs the mutation for the given variables. */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Optional callback invoked after the mutation succeeds. */
  onSuccess?: (
    data: TData,
    variables: TVariables,
    onMutateResult: TOnMutateResult,
    context: MutationFunctionContext,
  ) => void;
}
