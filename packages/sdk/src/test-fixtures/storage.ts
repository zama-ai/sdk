// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import type { FixturesOf } from "./types";

export function createMockStorage(): GenericStorage {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)) as GenericStorage["get"],
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
}

export interface StorageFixtures {
  storage: GenericStorage;
  createMockStorage: typeof createMockStorage;
}

export const storageFixtures: FixturesOf<StorageFixtures> = {
  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  createMockStorage: async ({}, use) => {
    await use(createMockStorage);
  },
};
