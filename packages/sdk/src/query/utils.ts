export { normalizeHandle } from "../utils";

// Adapted from the wagmi codebase
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-wrapper-object-types
function isPlainObject(value: any): value is Object {
  if (!hasObjectPrototype(value)) {
    return false;
  }

  // If has modified constructor
  const ctor = value.constructor;
  if (typeof ctor === "undefined") return true;

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) return false;

  // If constructor does not have an Object-specific method
  // biome-ignore lint/suspicious/noPrototypeBuiltins: using
  // eslint-disable-next-line no-prototype-builtins
  if (!prot.hasOwnProperty("isPrototypeOf")) return false;

  // Most likely a plain Object
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === "[object Object]";
}

export type StrippedQueryOptionKeys =
  // Keep this union aligned with @tanstack/query-core behavioral options
  // (for example QueryObserverOptions). Revisit on every upgrade to avoid
  // leaking query controls into lower-level query factories.
  | "gcTime"
  | "staleTime"
  | "enabled"
  | "select"
  | "refetchInterval"
  | "refetchOnMount"
  | "refetchOnWindowFocus"
  | "refetchOnReconnect"
  | "retry"
  | "retryDelay"
  | "retryOnMount"
  | "queryFn"
  | "queryKey"
  | "queryKeyHashFn"
  | "initialData"
  | "initialDataUpdatedAt"
  | "placeholderData"
  | "structuralSharing"
  | "throwOnError"
  | "meta"
  | "query"
  | "pollingInterval";

export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Remove TanStack behavioral options from a query config object so only domain
 * parameters remain for the lower-level factory.
 *
 * @example
 * ```ts
 * const params = filterQueryOptions({
 *   query: { enabled: false },
 *   gcTime: 60_000,
 *   owner: "0xabc",
 * });
 * // => { owner: "0xabc" }
 * ```
 */
export function filterQueryOptions<TOptions extends Record<string, unknown>>(
  options: TOptions,
): Omit<TOptions, StrippedQueryOptionKeys> {
  const {
    gcTime: _gcTime,
    staleTime: _staleTime,
    enabled: _enabled,
    select: _select,
    refetchInterval: _refetchInterval,
    refetchOnMount: _refetchOnMount,
    refetchOnWindowFocus: _refetchOnWindowFocus,
    refetchOnReconnect: _refetchOnReconnect,
    retry: _retry,
    retryDelay: _retryDelay,
    retryOnMount: _retryOnMount,
    queryFn: _queryFn,
    queryKey: _queryKey,
    queryKeyHashFn: _queryKeyHashFn,
    initialData: _initialData,
    initialDataUpdatedAt: _initialDataUpdatedAt,
    placeholderData: _placeholderData,
    structuralSharing: _structuralSharing,
    throwOnError: _throwOnError,
    meta: _meta,
    query: _query,
    pollingInterval: _pollingInterval,
    ...rest
  } = options;

  return rest;
}

/**
 * Stable hash function for query keys.
 * Sorts object keys recursively and converts bigint values to strings.
 *
 * @remarks
 * bigint values are serialized as decimal strings, so `42n` and `"42"` hash to
 * the same token when they occupy the same position. This collision is accepted
 * by design for the current query-key conventions in this package.
 */
export function hashFn(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey, (_, value) => {
    if (isPlainObject(value)) {
      return Object.keys(value)
        .sort()
        .reduce(
          (result, key) => {
            result[key] = value[key];
            return result;
          },
          {} as Record<string, unknown>,
        );
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    return value;
  });
}
