import type { GenericStringStorage } from "./token.types";

/** In-memory credential store. Credentials are lost on page reload. */
export class MemoryStorage implements GenericStringStorage {
  #map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }
}
