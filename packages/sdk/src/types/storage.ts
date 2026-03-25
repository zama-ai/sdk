/**
 * Pluggable key-value store for persisting FHE credentials.
 *
 * The SDK stores objects directly (not JSON strings). Implementations must
 * preserve value types through round-trips — e.g. `IndexedDBStorage` uses
 * structured clone, `MemoryStorage` stores values as-is.
 */
export interface GenericStorage {
  /** Retrieve a value by key. Returns `null` if the key does not exist. */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Store a value under the given key, overwriting any existing entry. */
  set<T = unknown>(key: string, value: T): Promise<void>;
  /** Remove the entry for the given key (no-op if absent). */
  delete(key: string): Promise<void>;
}
