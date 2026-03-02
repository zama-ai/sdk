import type { GenericStorage } from "./token.types";

/** In-memory credential store. Credentials are lost on page reload. */
export class MemoryStorage implements GenericStorage {
  #map = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.#map.get(key) as T) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.#map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const memoryStorage = new MemoryStorage();
