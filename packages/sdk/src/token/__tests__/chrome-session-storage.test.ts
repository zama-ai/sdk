import { describe, it, expect, vi, beforeEach } from "../../test-fixtures";
import { ChromeSessionStorage } from "../chrome-session-storage";

// ---------------------------------------------------------------------------
// Mock chrome.storage.session
// ---------------------------------------------------------------------------

const store = new Map<string, unknown>();

const mockSession = {
  get: vi.fn(async (key: string) => {
    const value = store.get(key);
    return value !== undefined ? { [key]: value } : {};
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(items)) {
      store.set(k, v);
    }
  }),
  remove: vi.fn(async (key: string) => {
    store.delete(key);
  }),
};

// Inject the chrome global before importing the module
vi.stubGlobal("chrome", { storage: { session: mockSession } });

describe("ChromeSessionStorage", () => {
  let storage: ChromeSessionStorage;

  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    storage = new ChromeSessionStorage();
  });

  it("returns null for missing keys", async () => {
    expect(await storage.get("missing")).toBeNull();
    expect(mockSession.get).toHaveBeenCalledWith("missing");
  });

  it("stores and retrieves values", async () => {
    await storage.set("key", "value");
    expect(mockSession.set).toHaveBeenCalledWith({ key: "value" });

    const result = await storage.get("key");
    expect(result).toBe("value");
  });

  it("overwrites existing values", async () => {
    await storage.set("key", "old");
    await storage.set("key", "new");
    expect(await storage.get("key")).toBe("new");
  });

  it("deletes values", async () => {
    await storage.set("key", "value");
    await storage.delete("key");
    expect(mockSession.remove).toHaveBeenCalledWith("key");
    expect(await storage.get("key")).toBeNull();
  });

  it("delete is a no-op for missing keys", async () => {
    await expect(storage.delete("missing")).resolves.not.toThrow();
  });

  it("handles complex objects", async () => {
    const obj = { nested: { array: [1, 2, 3] } };
    await storage.set("complex", obj);
    expect(await storage.get("complex")).toEqual(obj);
  });

  it("returns null when chrome.storage.session.get returns empty object", async () => {
    // Key not present → get returns {} → result[key] is undefined → ?? null
    expect(await storage.get("nonexistent")).toBeNull();
  });
});
