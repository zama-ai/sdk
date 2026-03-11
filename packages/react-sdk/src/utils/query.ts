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

/**
 * Combine a factory's `enabled` flag with the user's override.
 * Both default to `true` when not provided — the query only runs when both are truthy.
 *
 * TanStack Query v5's `enabled` can be a boolean or a `(query) => boolean` function.
 * When the factory returns a function, eager evaluation is not possible here,
 * so we fall back to treating functions as `true` (the factory's queryFn
 * guards will still prevent execution via skipToken).
 *
 * Accepts `unknown` because TanStack's `Enabled<T>` is generic and the concrete
 * type parameters vary per call-site — only runtime shape matters here.
 */
export function mergeEnabled(factoryEnabled: unknown, userEnabled: unknown): boolean {
  const factory =
    typeof factoryEnabled === "function" ? true : factoryEnabled === undefined || !!factoryEnabled;
  const user =
    typeof userEnabled === "function" ? true : userEnabled === undefined || !!userEnabled;
  return factory && user;
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
