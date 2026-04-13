import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStorage, mockSecureStore } = vi.hoisted(() => {
  const mockStorage = new Map<string, string>();
  const mockSecureStore = {
    getItemAsync: vi.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItemAsync: vi.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: vi.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  };
  return { mockStorage, mockSecureStore };
});

vi.mock("expo-secure-store", () => mockSecureStore);

import { SecureStoreAdapter } from "../secure-store-adapter";

describe("SecureStoreAdapter", () => {
  let adapter: SecureStoreAdapter;

  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    adapter = new SecureStoreAdapter();
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

  it("prefixes keys with the SecureStore-safe prefix", async () => {
    await adapter.set("test", "val");
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      "zama_fhe_test",
      JSON.stringify("val"),
    );
  });

  it("throws a contextual error and removes the entry when stored value is corrupted", async () => {
    mockStorage.set("zama_fhe_bad", "{not-valid-json");

    await expect(adapter.get("bad")).rejects.toThrow(/failed to parse stored value for key "bad"/);
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith("zama_fhe_bad");
    expect(await adapter.get("bad")).toBeNull();
  });
});
