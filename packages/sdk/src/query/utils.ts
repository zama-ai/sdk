function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type StrippedQueryOptionKeys =
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
  "0x0000000000000000000000000000000000000000000000000000000000000000";

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

export function normalizeHandle(value: unknown): string {
  if (typeof value === "string" && value.startsWith("0x")) return value;
  if (typeof value === "bigint") return `0x${value.toString(16).padStart(64, "0")}`;
  return ZERO_HANDLE;
}
