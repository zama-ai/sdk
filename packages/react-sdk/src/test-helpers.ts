import type { QueryClient, QueryKey } from "@tanstack/react-query";

export function expectCacheRemoved(qc: QueryClient, key: QueryKey): void {
  const query = qc.getQueryCache().find({ queryKey: key });
  if (query !== undefined || qc.getQueryData(key) !== undefined) {
    throw new Error("Expected query cache to be removed");
  }
}

export function expectCacheInvalidated(qc: QueryClient, key: QueryKey): void {
  const state = qc.getQueryState(key);
  if (state === undefined) {
    throw new Error("Expected query to exist in cache");
  }
  if (!state.isInvalidated) {
    throw new Error("Expected query cache to be invalidated");
  }
}

export function expectCacheUntouched(qc: QueryClient, key: QueryKey, value: unknown): void {
  const state = qc.getQueryState(key);
  if (state === undefined) {
    throw new Error("Expected query to exist in cache");
  }
  if (state.isInvalidated) {
    throw new Error("Expected query cache to remain valid");
  }
  if (qc.getQueryData(key) !== value) {
    throw new Error("Expected query cache value to remain unchanged");
  }
}
