import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";
import { loadCachedBalance, saveCachedBalance } from "../balance-cache";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OWNER = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const HANDLE = "0x00000000000000000000000000000000000000000000000000000000000000ab";
const HANDLE2 = "0x00000000000000000000000000000000000000000000000000000000000000cd";

describe("balance-cache", () => {
  it("returns null on cache miss", async () => {
    const storage = new MemoryStorage();
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBeNull();
  });

  it("persists and retrieves a balance", async () => {
    const storage = new MemoryStorage();
    await saveCachedBalance(storage, TOKEN, OWNER, HANDLE, 42n);
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBe(42n);
  });

  it("different handles produce different cache entries", async () => {
    const storage = new MemoryStorage();
    await saveCachedBalance(storage, TOKEN, OWNER, HANDLE, 100n);
    await saveCachedBalance(storage, TOKEN, OWNER, HANDLE2, 200n);
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBe(100n);
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE2)).toBe(200n);
  });

  it("handles zero balance", async () => {
    const storage = new MemoryStorage();
    await saveCachedBalance(storage, TOKEN, OWNER, HANDLE, 0n);
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBe(0n);
  });

  it("is case-insensitive for token and owner addresses", async () => {
    const storage = new MemoryStorage();
    const upperToken = TOKEN.toUpperCase() as `0x${string}`;
    const upperOwner = OWNER.toUpperCase() as `0x${string}`;
    await saveCachedBalance(storage, upperToken, upperOwner, HANDLE, 999n);
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBe(999n);
  });

  it("does not throw when storage.getItem fails", async () => {
    const storage = new MemoryStorage();
    storage.getItem = () => Promise.reject(new Error("storage unavailable"));
    expect(await loadCachedBalance(storage, TOKEN, OWNER, HANDLE)).toBeNull();
  });

  it("does not throw when storage.setItem fails", async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => Promise.reject(new Error("storage unavailable"));
    await expect(saveCachedBalance(storage, TOKEN, OWNER, HANDLE, 42n)).resolves.toBeUndefined();
  });
});
