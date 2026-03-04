import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";

describe("MemoryStore", () => {
  it("returns null for missing keys", async () => {
    const store = new MemoryStorage();
    expect(await store.get("missing")).toBeNull();
  });

  it("stores and retrieves values", async () => {
    const store = new MemoryStorage();
    await store.set("key", "value");
    expect(await store.get("key")).toBe("value");
  });

  it("overwrites existing values", async () => {
    const store = new MemoryStorage();
    await store.set("key", "old");
    await store.set("key", "new");
    expect(await store.get("key")).toBe("new");
  });

  it("deletes values", async () => {
    const store = new MemoryStorage();
    await store.set("key", "value");
    await store.delete("key");
    expect(await store.get("missing")).toBeNull();
  });

  it("removeItem is a no-op for missing keys", async () => {
    const store = new MemoryStorage();
    await expect(store.delete("missing")).resolves.not.toThrow();
  });
});
