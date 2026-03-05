import { describe, it, expect } from "../../test-fixtures";
import { loadCachedBalance, saveCachedBalance, clearAllCachedBalances } from "../balance-cache";

const OWNER = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const HANDLE = "0x00000000000000000000000000000000000000000000000000000000000000ab";
const HANDLE2 = "0x00000000000000000000000000000000000000000000000000000000000000cd";

describe("balance-cache", () => {
  it("returns null on cache miss", async ({ storage, tokenAddress }) => {
    expect(
      await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE }),
    ).toBeNull();
  });

  it("persists and retrieves a balance", async ({ storage, tokenAddress }) => {
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE,
      value: 42n,
    });
    expect(await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE })).toBe(
      42n,
    );
  });

  it("different handles produce different cache entries", async ({ storage, tokenAddress }) => {
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE,
      value: 100n,
    });
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE2,
      value: 200n,
    });
    expect(await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE })).toBe(
      100n,
    );
    expect(await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE2 })).toBe(
      200n,
    );
  });

  it("handles zero balance", async ({ storage, tokenAddress }) => {
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE,
      value: 0n,
    });
    expect(await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE })).toBe(
      0n,
    );
  });

  it("is case-insensitive for token, owner, and handle", async ({ storage, tokenAddress }) => {
    const upperToken = tokenAddress.toUpperCase() as `0x${string}`;
    const upperOwner = OWNER.toUpperCase() as `0x${string}`;
    const upperHandle = HANDLE.toUpperCase() as `0x${string}`;
    await saveCachedBalance({
      storage,
      tokenAddress: upperToken,
      owner: upperOwner,
      handle: upperHandle,
      value: 999n,
    });
    expect(await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE })).toBe(
      999n,
    );
  });

  it("does not throw when storage.getItem fails", async ({ storage, tokenAddress }) => {
    storage.get = () => Promise.reject(new Error("storage unavailable"));
    expect(
      await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE }),
    ).toBeNull();
  });

  it("does not throw when storage.setItem fails", async ({ storage, tokenAddress }) => {
    storage.set = () => Promise.reject(new Error("storage unavailable"));
    await expect(
      saveCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE, value: 42n }),
    ).resolves.toBeUndefined();
  });

  it("clearAllCachedBalances removes all cached entries", async ({ storage, tokenAddress }) => {
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE,
      value: 100n,
    });
    await saveCachedBalance({
      storage,
      tokenAddress,
      owner: OWNER,
      handle: HANDLE2,
      value: 200n,
    });

    await clearAllCachedBalances(storage);

    expect(
      await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE }),
    ).toBeNull();
    expect(
      await loadCachedBalance({ storage, tokenAddress, owner: OWNER, handle: HANDLE2 }),
    ).toBeNull();
  });

  it("clearAllCachedBalances is a no-op on empty storage", async ({ storage }) => {
    await expect(clearAllCachedBalances(storage)).resolves.toBeUndefined();
  });

  it("clearAllCachedBalances does not throw when storage fails", async ({ storage }) => {
    storage.get = () => Promise.reject(new Error("storage unavailable"));
    await expect(clearAllCachedBalances(storage)).resolves.toBeUndefined();
  });
});
