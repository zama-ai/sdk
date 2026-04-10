import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GenericStorage } from "@zama-fhe/sdk";

const KEY_PREFIX = "@zama-fhe:";

/**
 * GenericStorage implementation backed by React Native AsyncStorage.
 * Values are JSON-serialized. Keys are prefixed with `@zama-fhe:` to avoid collisions.
 */
export class AsyncStorageAdapter implements GenericStorage {
  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${key}`);
    if (raw === null) {return null;}
    return JSON.parse(raw) as T;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await AsyncStorage.removeItem(`${KEY_PREFIX}${key}`);
  }
}
