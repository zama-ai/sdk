import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GenericStorage } from "@zama-fhe/sdk";

const KEY_PREFIX = "@zama-fhe:";

/**
 * GenericStorage implementation backed by React Native AsyncStorage.
 * Values are JSON-serialized. Keys are prefixed with `@zama-fhe:` to avoid collisions.
 */
export class AsyncStorageAdapter implements GenericStorage {
  async get<T = unknown>(key: string): Promise<T | null> {
    const prefixedKey = `${KEY_PREFIX}${key}`;
    const raw = await AsyncStorage.getItem(prefixedKey);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (cause) {
      // Corrupted entry — remove it so subsequent reads start clean, then
      // throw with context so the caller knows which key failed and why.
      await AsyncStorage.removeItem(prefixedKey).catch(() => {
        // Ignore cleanup failures: the original parse error is more important.
      });
      throw new Error(
        `AsyncStorageAdapter: failed to parse stored value for key "${key}". ` +
          "The corrupted entry has been removed.",
        { cause },
      );
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await AsyncStorage.removeItem(`${KEY_PREFIX}${key}`);
  }
}
