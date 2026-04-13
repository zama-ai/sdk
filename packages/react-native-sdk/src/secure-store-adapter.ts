import * as SecureStore from "expo-secure-store";
import type { GenericStorage } from "@zama-fhe/sdk";

// SecureStore keys are restricted to `[A-Za-z0-9._-]+`, so we cannot reuse
// the web-style `@zama-fhe:` prefix used by the other adapters.
const KEY_PREFIX = "zama_fhe_";

/**
 * `GenericStorage` backed by `expo-secure-store` — iOS Keychain / Android
 * Keystore. Intended for the durable `storage` slot of the SDK, where
 * credentials and long-lived secrets live.
 *
 * Limitations to keep in mind:
 * - Keys must match `[A-Za-z0-9._-]+`. Arbitrary key characters are rejected
 *   by the underlying native API; prefer short alphanumeric keys.
 * - Values must be strings and are JSON-serialized here.
 * - SecureStore is designed for small secrets (keys, tokens), not multi-MB
 *   blobs. For large payloads (FHE public params, etc.), use
 *   `SqliteKvStoreAdapter` instead and keep only the encryption key here.
 */
export class SecureStoreAdapter implements GenericStorage {
  async get<T = unknown>(key: string): Promise<T | null> {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    const raw = await SecureStore.getItemAsync(prefixedKey);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (cause) {
      // Corrupted entry — try to remove it so subsequent reads start clean.
      // We do NOT let a cleanup failure mask the parse error (the caller
      // needs to know the entry was corrupt), but we surface cleanup errors
      // via the logger so an infinite parse/cleanup loop doesn't go silent.
      await SecureStore.deleteItemAsync(prefixedKey).catch((cleanupError: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`SecureStoreAdapter: failed to delete corrupted entry "${key}"`, cleanupError);
      });
      throw new Error(
        `SecureStoreAdapter: failed to parse stored value for key "${key}". ` +
          "The corrupted entry has been removed.",
        { cause },
      );
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await SecureStore.setItemAsync(`${KEY_PREFIX}${key}`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${KEY_PREFIX}${key}`);
  }
}
