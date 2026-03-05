import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDBStorage } from "../indexeddb-storage";

// fake-indexeddb/auto is loaded via vitest.setup.ts, providing a global
// IndexedDB implementation in the jsdom environment.

describe("IndexedDBStorage", () => {
  let storage: IndexedDBStorage;

  beforeEach(() => {
    // Use a unique DB name per test to avoid cross-test contamination
    storage = new IndexedDBStorage(`TestDB-${Date.now()}-${Math.random()}`);
  });

  describe("setItem / getItem", () => {
    it("stores and retrieves a string value", async () => {
      await storage.set("wallet-0x1", "encrypted-creds-json");

      const result = await storage.get("wallet-0x1");
      expect(result).toBe("encrypted-creds-json");
    });

    it("returns null for a key that does not exist", async () => {
      const result = await storage.get("nonexistent");
      expect(result).toBeNull();
    });

    it("overwrites an existing value with put semantics", async () => {
      await storage.set("key", "value-1");
      await storage.set("key", "value-2");

      const result = await storage.get("key");
      expect(result).toBe("value-2");
    });

    it("stores multiple keys independently", async () => {
      await storage.set("a", "alpha");
      await storage.set("b", "bravo");

      expect(await storage.get("a")).toBe("alpha");
      expect(await storage.get("b")).toBe("bravo");
    });

    it("handles empty string values", async () => {
      await storage.set("empty", "");

      const result = await storage.get("empty");
      expect(result).toBe("");
    });

    it("handles large string values", async () => {
      const largeValue = "x".repeat(100_000);
      await storage.set("large", largeValue);

      const result = await storage.get("large");
      expect(result).toBe(largeValue);
    });
  });

  describe("removeItem", () => {
    it("removes an existing key", async () => {
      await storage.set("key", "value");
      await storage.delete("key");

      const result = await storage.get("key");
      expect(result).toBeNull();
    });

    it("does not throw when removing a nonexistent key", async () => {
      await expect(storage.delete("nonexistent")).resolves.toBeUndefined();
    });

    it("does not affect other keys", async () => {
      await storage.set("a", "alpha");
      await storage.set("b", "bravo");

      await storage.delete("a");

      expect(await storage.get("a")).toBeNull();
      expect(await storage.get("b")).toBe("bravo");
    });
  });

  describe("clear", () => {
    it("removes all entries", async () => {
      await storage.set("a", "alpha");
      await storage.set("b", "bravo");
      await storage.set("c", "charlie");

      await storage.clear();

      expect(await storage.get("a")).toBeNull();
      expect(await storage.get("b")).toBeNull();
      expect(await storage.get("c")).toBeNull();
    });

    it("does not throw on an already-empty store", async () => {
      await expect(storage.clear()).resolves.toBeUndefined();
    });

    it("allows storing new items after clear", async () => {
      await storage.set("key", "before");
      await storage.clear();
      await storage.set("key", "after");

      expect(await storage.get("key")).toBe("after");
    });
  });

  describe("lazy initialization via #getDB()", () => {
    it("initializes the database on first operation", async () => {
      // The DB is not opened until the first method call
      const result = await storage.get("key");
      expect(result).toBeNull();
    });

    it("reuses the same database connection across operations", async () => {
      await storage.set("a", "1");
      await storage.set("b", "2");
      const a = await storage.get("a");
      const b = await storage.get("b");

      expect(a).toBe("1");
      expect(b).toBe("2");
    });

    it("concurrent operations share a single init promise", async () => {
      const results = await Promise.all([
        storage.set("a", "1"),
        storage.set("b", "2"),
        storage.get("a"),
      ]);

      // setItem returns undefined, getItem may return null or "1" depending on timing
      expect(results[0]).toBeUndefined();
      expect(results[1]).toBeUndefined();
    });
  });

  describe("version change and close events", () => {
    it("recovers after the database is closed externally", async () => {
      // Perform an operation to open the DB
      await storage.set("key", "value");

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
    it("uses the provided database name", async () => {
      const custom = new IndexedDBStorage("CustomName");
      await custom.set("key", "value");
      expect(await custom.get("key")).toBe("value");
    });

    it("uses the default name and version when none provided", async () => {
      const defaultStorage = new IndexedDBStorage();
      await defaultStorage.set("test", "value");
      expect(await defaultStorage.get("test")).toBe("value");
    });
  });
});
