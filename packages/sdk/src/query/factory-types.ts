import type {
  MutationFunctionContext,
  QueryKey,
  QueryObserverOptions,
  skipToken,
} from "@tanstack/query-core";

/** @internal */
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

/** @internal */
export interface MutationFactoryOptions<
  TMutationKey extends readonly unknown[],
  TVariables,
  TData,
  TOnMutateResult = unknown,
> {
  mutationKey: TMutationKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    onMutateResult: TOnMutateResult,
    context: MutationFunctionContext,
  ) => void;
}
