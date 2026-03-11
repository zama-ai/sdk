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
 * Mirrors the wagmi pattern: a single `as any` here replaces per-hook casts.
 *
 * TanStack's useQuery has discriminated overloads around `initialData` that make
 * it extremely hard to pass inferred types through. We bypass that by casting
 * internally — the type safety boundary is at the factory and hook levels.
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
 * When the factory returns a function, we evaluate it eagerly is not possible here,
 * so we fall back to treating non-boolean values as `true` (the factory's queryFn
 * guards will still prevent execution via skipToken).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnabledLike = boolean | ((...args: any[]) => boolean) | undefined;

export function mergeEnabled(factoryEnabled: EnabledLike, userEnabled: EnabledLike): boolean {
  const factory = typeof factoryEnabled === "function" ? true : (factoryEnabled ?? true);
  const user = typeof userEnabled === "function" ? true : (userEnabled ?? true);
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
