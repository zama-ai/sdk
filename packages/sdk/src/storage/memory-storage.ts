import type { GenericStorage } from "../types";

/** In-memory credential store. Credentials are lost on page reload. */
export class MemoryStorage implements GenericStorage {
  #map = new Map<string, unknown>();

  /**
   * Retrieve a value by key.
   * @returns The stored value, or `null` if the key does not exist.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.#map.get(key) as T) ?? null;
  }

  /** Store a value under the given key, overwriting any existing entry. */
  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.#map.set(key, value);
  }

  /** Remove the entry for the given key (no-op if absent). */
  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const memoryStorage = new MemoryStorage();
