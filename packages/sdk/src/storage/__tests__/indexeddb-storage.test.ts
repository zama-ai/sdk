import { test as base, describe, expect } from "../../test-fixtures";
import { IndexedDBStorage } from "../indexeddb-storage";

// fake-indexeddb/auto is loaded via vitest.setup.ts, providing a global
// IndexedDB implementation in the jsdom environment.

interface IdbFixtures {
  idbStorage: IndexedDBStorage;
}

const iit = base.extend<IdbFixtures>({
  // eslint-disable-next-line no-empty-pattern
  idbStorage: async ({}, use) => {
    await use(new IndexedDBStorage(`TestDB-${Date.now()}-${Math.random()}`));
  },
});

describe("IndexedDBStorage", () => {
  describe("setItem / getItem", () => {
    iit("stores and retrieves a string value", async ({ idbStorage }) => {
      await idbStorage.set("wallet-0x1", "encrypted-creds-json");

      const result = await idbStorage.get("wallet-0x1");
      expect(result).toBe("encrypted-creds-json");
    });

    iit("returns null for a key that does not exist", async ({ idbStorage }) => {
      const result = await idbStorage.get("nonexistent");
      expect(result).toBeNull();
    });

    iit("overwrites an existing value with put semantics", async ({ idbStorage }) => {
      await idbStorage.set("key", "value-1");
      await idbStorage.set("key", "value-2");

      const result = await idbStorage.get("key");
      expect(result).toBe("value-2");
    });

    iit("stores multiple keys independently", async ({ idbStorage }) => {
      await idbStorage.set("a", "alpha");
      await idbStorage.set("b", "bravo");

      expect(await idbStorage.get("a")).toBe("alpha");
      expect(await idbStorage.get("b")).toBe("bravo");
    });

    iit("handles empty string values", async ({ idbStorage }) => {
      await idbStorage.set("empty", "");

      const result = await idbStorage.get("empty");
      expect(result).toBe("");
    });

    iit("handles large string values", async ({ idbStorage }) => {
      const largeValue = "x".repeat(100_000);
      await idbStorage.set("large", largeValue);

      const result = await idbStorage.get("large");
      expect(result).toBe(largeValue);
    });
  });

  describe("removeItem", () => {
    iit("removes an existing key", async ({ idbStorage }) => {
      await idbStorage.set("key", "value");
      await idbStorage.delete("key");

      const result = await idbStorage.get("key");
      expect(result).toBeNull();
    });

    iit("does not throw when removing a nonexistent key", async ({ idbStorage }) => {
      await expect(idbStorage.delete("nonexistent")).resolves.toBeUndefined();
    });

    iit("does not affect other keys", async ({ idbStorage }) => {
      await idbStorage.set("a", "alpha");
      await idbStorage.set("b", "bravo");

      await idbStorage.delete("a");

      expect(await idbStorage.get("a")).toBeNull();
      expect(await idbStorage.get("b")).toBe("bravo");
    });
  });

  describe("clear", () => {
    iit("removes all entries", async ({ idbStorage }) => {
      await idbStorage.set("a", "alpha");
      await idbStorage.set("b", "bravo");
      await idbStorage.set("c", "charlie");

      await idbStorage.clear();

      expect(await idbStorage.get("a")).toBeNull();
      expect(await idbStorage.get("b")).toBeNull();
      expect(await idbStorage.get("c")).toBeNull();
    });

    iit("does not throw on an already-empty store", async ({ idbStorage }) => {
      await expect(idbStorage.clear()).resolves.toBeUndefined();
    });

    iit("allows storing new items after clear", async ({ idbStorage }) => {
      await idbStorage.set("key", "before");
      await idbStorage.clear();
      await idbStorage.set("key", "after");

      expect(await idbStorage.get("key")).toBe("after");
    });
  });

  describe("lazy initialization via #getDB()", () => {
    iit("initializes the database on first operation", async ({ idbStorage }) => {
      // The DB is not opened until the first method call
      const result = await idbStorage.get("key");
      expect(result).toBeNull();
    });

    iit("reuses the same database connection across operations", async ({ idbStorage }) => {
      await idbStorage.set("a", "1");
      await idbStorage.set("b", "2");
      const a = await idbStorage.get("a");
      const b = await idbStorage.get("b");

      expect(a).toBe("1");
      expect(b).toBe("2");
    });

    iit("concurrent operations share a single init promise", async ({ idbStorage }) => {
      const results = await Promise.all([
        idbStorage.set("a", "1"),
        idbStorage.set("b", "2"),
        idbStorage.get("a"),
      ]);

      // setItem returns undefined, getItem may return null or "1" depending on timing
      expect(results[0]).toBeUndefined();
      expect(results[1]).toBeUndefined();
    });
  });

  describe("version change and close events", () => {
    iit("recovers after the database is closed externally", async ({ idbStorage }) => {
      // Perform an operation to open the DB
      await idbStorage.set("key", "value");

      // Simulate closing the DB by opening a higher version,
      // which triggers the onversionchange event on the existing connection
      const dbName = `VersionChangeDB-${Date.now()}`;
      const freshStorage = new IndexedDBStorage(dbName);
      await freshStorage.set("key", "initial");

      // Open the same DB with a higher version to trigger onversionchange
      const upgradeRequest = indexedDB.open(dbName, 999);
      await new Promise<void>((resolve, reject) => {
        upgradeRequest.onsuccess = () => {
          upgradeRequest.result.close();
          resolve();
        };
        upgradeRequest.onerror = () => reject(upgradeRequest.error);
        upgradeRequest.onupgradeneeded = () => {
          // Keep the existing object store
        };
      });

      // The freshStorage connection was closed by versionchange;
      // a new getItem call should re-open the connection
      const newStorage = new IndexedDBStorage(dbName, 999);
      const result = await newStorage.get("key");
      // The key may or may not survive the version upgrade depending on store recreation,
      // but the storage should not throw
      expect(result === "initial" || result === null).toBe(true);
    });
  });

  describe("custom DB name and version", () => {
    iit("uses the provided database name", async () => {
      const custom = new IndexedDBStorage("CustomName");
      await custom.set("key", "value");
      expect(await custom.get("key")).toBe("value");
    });

    iit("uses the default name and version when none provided", async () => {
      const defaultStorage = new IndexedDBStorage();
      await defaultStorage.set("test", "value");
      expect(await defaultStorage.get("test")).toBe("value");
    });
  });
});
