import {
  type DefaultError,
  type QueriesOptions,
  type QueriesResults,
  useQueries as tanstack_useQueries,
  useQuery as tanstack_useQuery,
  useSuspenseQuery as tanstack_useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";

/**
 * Thin wrapper around TanStack's useQuery that injects our custom queryKeyHashFn.
 * Mirrors the wagmi pattern — the type safety boundary is at the factory and hook levels.
 *
 * Callers typically specify only `<TData>` (e.g. `useQuery<PublicKeyData>(...)`) while
 * factory options carry specific tuple keys (e.g. `readonly ["zama.publicKey"]`).
 * We erase the QueryKey param via `AnyKeyQueryOptions` so callers don't need to
 * spell out the key type — any QueryKey subtype is accepted.
 */
type AnyKeyQueryOptions<TData, TError> = UseQueryOptions<
  TData,
  TError,
  TData,
  // oxlint-disable-next-line typescript/no-explicit-any
  any
>;
type AnyKeySuspenseOptions<TData, TError> = UseSuspenseQueryOptions<
  TData,
  TError,
  TData,
  // oxlint-disable-next-line typescript/no-explicit-any
  any
>;

export function useQuery<TData = unknown, TError = DefaultError>(
  options: AnyKeyQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
  return tanstack_useQuery({
    ...options,
    queryKeyHashFn: hashFn,
  });
}

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  options: AnyKeySuspenseOptions<TData, TError>,
): UseSuspenseQueryResult<TData, TError> {
  return tanstack_useSuspenseQuery({
    ...options,
    queryKeyHashFn: hashFn,
  });
}

/**
 * Thin wrapper around TanStack's useQueries that injects our custom queryKeyHashFn
 * on every query in the array.
 */
export function useQueries<
  // oxlint-disable-next-line typescript/no-explicit-any
  T extends Array<any>,
  TCombinedResult = QueriesResults<T>,
>({
  queries,
  ...options
}: {
  queries: readonly [...QueriesOptions<T>];
  combine?: (result: QueriesResults<T>) => TCombinedResult;
  subscribed?: boolean;
}): TCombinedResult {
  return tanstack_useQueries({
    ...options,
    queries: queries.map((q) => ({
      ...q,
      queryKeyHashFn: hashFn,
    })) as [...QueriesOptions<T>],
  });
}
