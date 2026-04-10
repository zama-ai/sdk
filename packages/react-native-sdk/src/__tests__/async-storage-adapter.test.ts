import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStorage, mockAsyncStorage } = vi.hoisted(() => {
  const mockStorage = new Map<string, string>();
  const mockAsyncStorage = {
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
  return { mockStorage, mockAsyncStorage };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mockAsyncStorage,
}));

import { AsyncStorageAdapter } from "../async-storage-adapter";

describe("AsyncStorageAdapter", () => {
  let adapter: AsyncStorageAdapter;

  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    adapter = new AsyncStorageAdapter();
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
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("@zama-fhe:missing");
  });

  it("prefixes keys to avoid collisions", async () => {
    await adapter.set("test", "val");
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("@zama-fhe:test", JSON.stringify("val"));
  });
});
