import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";

describe("MemoryStore", () => {
  it("returns null for missing keys", () => {
    const store = new MemoryStorage();
    expect(store.getItem("missing")).toBeNull();
  });

  it("stores and retrieves values", () => {
    const store = new MemoryStorage();
    store.setItem("key", "value");
    expect(store.getItem("key")).toBe("value");
  });

  it("overwrites existing values", () => {
    const store = new MemoryStorage();
    store.setItem("key", "old");
    store.setItem("key", "new");
    expect(store.getItem("key")).toBe("new");
  });

  it("deletes values", () => {
    const store = new MemoryStorage();
    store.setItem("key", "value");
    store.removeItem("key");
    expect(store.getItem("missing")).toBeNull();
  });

  it("removeItem is a no-op for missing keys", () => {
    const store = new MemoryStorage();
    expect(() => store.removeItem("missing")).not.toThrow();
  });
});
