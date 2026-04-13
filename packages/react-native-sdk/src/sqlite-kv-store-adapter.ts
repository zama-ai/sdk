import KvStore from "expo-sqlite/kv-store";
import type { GenericStorage } from "@zama-fhe/sdk";

const KEY_PREFIX = "@zama-fhe:";

/**
 * `GenericStorage` backed by `expo-sqlite/kv-store` — an
 * AsyncStorage-compatible key/value store on top of SQLite. Used by
 * `RelayerNative` as the default `fheArtifactStorage` for caching the FHE
 * public key and public params (which can reach several MB — a size
 * SecureStore is not designed for). Also suitable for the SDK's
 * `sessionStorage` slot for per-session caches (balance caches, decryption
 * handles, etc.).
 *
 * Values are JSON-serialized. Keys are prefixed with `@zama-fhe:` to avoid
 * collisions with other libraries sharing the same backing database.
 */
export class SqliteKvStoreAdapter implements GenericStorage {
  async get<T = unknown>(key: string): Promise<T | null> {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    const raw = await KvStore.getItem(prefixedKey);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (cause) {
      // Corrupted entry — try to remove it so subsequent reads start clean.
      // Log (but do not mask) any cleanup failure so an infinite
      // parse/cleanup loop surfaces a diagnostic.
      await KvStore.removeItem(prefixedKey).catch((cleanupError: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          `SqliteKvStoreAdapter: failed to delete corrupted entry "${key}"`,
          cleanupError,
        );
      });
      throw new Error(
        `SqliteKvStoreAdapter: failed to parse stored value for key "${key}". ` +
          "The corrupted entry has been removed.",
        { cause },
      );
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await KvStore.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await KvStore.removeItem(`${KEY_PREFIX}${key}`);
  }
}
