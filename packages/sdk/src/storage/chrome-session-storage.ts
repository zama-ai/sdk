import type { GenericStorage } from "../types";

/** Minimal chrome.storage.session typings (avoids depending on @types/chrome). */
declare const chrome: {
  storage: {
    session: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
};

/**
 * {@link GenericStorage} backed by `chrome.storage.session`.
 *
 * Use this in MV3 web extensions so the wallet signature survives
 * service worker restarts and is shared across popup, background,
 * and content script contexts.
 *
 * @example
 * ```ts
 * import { ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";
 * import { createConfig } from "@zama-fhe/sdk/viem";
 *
 * const config = createConfig({
 *   chains: [mySepolia],
 *   publicClient,
 *   walletClient,
 *   relayers: { [mySepolia.id]: web() },
 *   storage: indexedDBStorage, // encrypted transport key pair — persistent
 *   permitStorage: chromeSessionStorage, // signed permits — ephemeral
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export class ChromeSessionStorage implements GenericStorage {
  /**
   * Retrieve a value by key.
   * @returns The stored value, or `null` if the key does not exist.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const result = await chrome.storage.session.get(key);
    return (result[key] as T) ?? null;
  }

  /** Store a value under the given key, overwriting any existing entry. */
  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  }

  /** Remove the entry for the given key (no-op if absent). */
  async delete(key: string): Promise<void> {
    await chrome.storage.session.remove(key);
  }
}

/** Default singleton for application-wide use. */
export const chromeSessionStorage = new ChromeSessionStorage();
