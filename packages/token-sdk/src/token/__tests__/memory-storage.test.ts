import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";

describe("MemoryStore", () => {
  it("returns null for missing keys", async () => {
    const store = new MemoryStorage();
    expect(await store.getItem("missing")).toBeNull();
  });

  it("stores and retrieves values", async () => {
    const store = new MemoryStorage();
    await store.setItem("key", "value");
    expect(await store.getItem("key")).toBe("value");
  });

  it("overwrites existing values", async () => {
    const store = new MemoryStorage();
    await store.setItem("key", "old");
    await store.setItem("key", "new");
    expect(await store.getItem("key")).toBe("new");
  });

  it("deletes values", async () => {
    const store = new MemoryStorage();
    await store.setItem("key", "value");
    await store.removeItem("key");
    expect(await store.getItem("missing")).toBeNull();
  });

  it("removeItem is a no-op for missing keys", async () => {
    const store = new MemoryStorage();
    await expect(store.removeItem("missing")).resolves.not.toThrow();
  });
});
