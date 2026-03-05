export interface QueryContext<TQueryKey extends readonly unknown[]> {
  queryKey: TQueryKey;
}

export interface QueryFactoryOptions<TQueryKey extends readonly unknown[], TData> {
  queryKey: TQueryKey;
  queryFn: (context: QueryContext<TQueryKey>) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

export interface MutationFactoryOptions<
  TMutationKey extends readonly unknown[],
  TVariables,
  TData,
> {
  mutationKey: TMutationKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
}
