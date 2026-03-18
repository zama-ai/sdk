import type {
  MutationFunctionContext,
  QueryKey,
  QueryObserverOptions,
  skipToken,
} from "@tanstack/query-core";

type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

export type QueryFactoryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  RequiredBy<
    QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
    "queryKey"
  >,
  "queryFn" | "queryHash" | "queryKeyHashFn" | "throwOnError"
> & {
  queryFn: Exclude<
    QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>["queryFn"],
    typeof skipToken | undefined
  >;
};

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
