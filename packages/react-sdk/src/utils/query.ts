import {
  type DefaultError,
  useQuery as tanstack_useQuery,
  useSuspenseQuery as tanstack_useSuspenseQuery,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";

/**
 * Thin wrapper around TanStack's useQuery that injects our custom queryKeyHashFn.
 * Mirrors the wagmi pattern — the type safety boundary is at the factory and hook levels.
 *
 * The `options` parameter is typed as `any` because TanStack Query v5 has:
 * 1. Discriminated overloads around `initialData` (Defined vs Undefined)
 * 2. Function-typed fields (`staleTime`, `enabled`, `gcTime`) that are generic over `TQueryKey`
 *
 * Our factories produce options with specific tuple keys (e.g. `readonly ["zama.totalSupply", {...}]`)
 * whose function-typed fields are contravariant with `QueryKey` (`readonly unknown[]`).
 * Typing the parameter as `UseQueryOptions<TData, TError, TData, any>` still fails because
 * the query-key variance leaks through `staleTime`, `enabled`, etc.
 *
 * Hooks must pass explicit generics: `useQuery<DataType>({...})`.
 */
export function useQuery<TData = unknown, TError = DefaultError>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
): UseQueryResult<TData, TError> {
  return tanstack_useQuery({
    ...options,
    queryKeyHashFn: hashFn,
  }) as UseQueryResult<TData, TError>;
}

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
): UseSuspenseQueryResult<TData, TError> {
  return tanstack_useSuspenseQuery({
    ...options,
    queryKeyHashFn: hashFn,
  }) as UseSuspenseQueryResult<TData, TError>;
}
