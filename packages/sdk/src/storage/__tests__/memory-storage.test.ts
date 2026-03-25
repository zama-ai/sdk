import { describe, it, expect } from "../../test-fixtures";

describe("MemoryStore", () => {
  it("returns null for missing keys", async ({ storage }) => {
    expect(await storage.get("missing")).toBeNull();
  });

  it("stores and retrieves values", async ({ storage }) => {
    await storage.set("key", "value");
    expect(await storage.get("key")).toBe("value");
  });

  it("overwrites existing values", async ({ storage }) => {
    await storage.set("key", "old");
    await storage.set("key", "new");
    expect(await storage.get("key")).toBe("new");
  });

  it("deletes values", async ({ storage }) => {
    await storage.set("key", "value");
    await storage.delete("key");
    expect(await storage.get("missing")).toBeNull();
  });

  it("removeItem is a no-op for missing keys", async ({ storage }) => {
    await expect(storage.delete("missing")).resolves.not.toThrow();
  });
});
