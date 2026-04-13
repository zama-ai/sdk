import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStorage, mockKvStore } = vi.hoisted(() => {
  const mockStorage = new Map<string, string>();
  const mockKvStore = {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  };
  return { mockStorage, mockKvStore };
});

vi.mock("expo-sqlite/kv-store", () => ({
  default: mockKvStore,
}));

import { SqliteKvStoreAdapter } from "../sqlite-kv-store-adapter";

describe("SqliteKvStoreAdapter", () => {
  let adapter: SqliteKvStoreAdapter;

  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    adapter = new SqliteKvStoreAdapter();
  });

  it("returns null for missing keys", async () => {
    expect(await adapter.get("missing")).toBeNull();
  });

  it("round-trips a string value", async () => {
    await adapter.set("key", "hello");
    expect(await adapter.get("key")).toBe("hello");
  });

  it("round-trips an object value", async () => {
    const obj = { publicKey: "0xabc", durationDays: 30 };
    await adapter.set("creds", obj);
    expect(await adapter.get("creds")).toEqual(obj);
  });

  it("deletes a key", async () => {
    await adapter.set("key", "value");
    await adapter.delete("key");
    expect(await adapter.get("key")).toBeNull();
  });

  it("delete is a no-op for missing keys", async () => {
    await adapter.delete("missing");
    expect(mockKvStore.removeItem).toHaveBeenCalledWith("@zama-fhe:missing");
  });

  it("prefixes keys to avoid collisions", async () => {
    await adapter.set("test", "val");
    expect(mockKvStore.setItem).toHaveBeenCalledWith("@zama-fhe:test", JSON.stringify("val"));
  });

  it("throws a contextual error and removes the entry when stored value is corrupted", async () => {
    mockStorage.set("@zama-fhe:bad", "{not-valid-json");

    await expect(adapter.get("bad")).rejects.toThrow(/failed to parse stored value for key "bad"/);
    expect(mockKvStore.removeItem).toHaveBeenCalledWith("@zama-fhe:bad");
    expect(await adapter.get("bad")).toBeNull();
  });
});
