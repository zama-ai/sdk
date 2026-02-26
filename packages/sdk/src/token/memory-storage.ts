import type { GenericStringStorage } from "./token.types";

/** In-memory credential store. Credentials are lost on page reload. */
export class MemoryStorage implements GenericStringStorage {
  #map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.#map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.#map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.#map.delete(key);
  }
}

/** Default singleton for application-wide use. */
export const memoryStorage = new MemoryStorage();
