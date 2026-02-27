import type { GenericStorage } from "./token.types";

/** In-memory credential store. Credentials are lost on page reload. */
export class MemoryStorage<T = unknown> implements GenericStorage<T> {
  #map = new Map<string, T>();

  async get(key: string): Promise<T | null> {
    return this.#map.get(key) ?? null;
  }

  async set(key: string, value: T): Promise<void> {
    this.#map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const memoryStorage = new MemoryStorage();
