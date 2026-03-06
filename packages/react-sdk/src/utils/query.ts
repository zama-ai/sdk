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

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
): UseSuspenseQueryResult<TData, TError> {
  return tanstack_useSuspenseQuery({
    ...options,
    queryKeyHashFn: hashFn,
  }) as UseSuspenseQueryResult<TData, TError>;
}
