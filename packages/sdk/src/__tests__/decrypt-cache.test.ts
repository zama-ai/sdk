import { describe, it, expect } from "../test-fixtures";
import {
  clearAllCachedDecryptions,
  clearCachedDecryptionsForContracts,
  clearCachedUserDecryptions,
  loadCachedUserDecryption,
  saveCachedUserDecryption,
} from "../decrypt-cache";

const HANDLE = "0x00000000000000000000000000000000000000000000000000000000000000ab";
const HANDLE2 = "0x00000000000000000000000000000000000000000000000000000000000000cd";
const REQUESTER_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
const REQUESTER_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;
const CONTRACT_A = "0x1111111111111111111111111111111111111111" as const;
const CONTRACT_B = "0x2222222222222222222222222222222222222222" as const;

describe("decrypt-cache", () => {
  it("returns null on cache miss", async ({ storage }) => {
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
  });

  it("persists and retrieves a value", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 42n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(42n);
  });

  it("persists typed values directly in storage", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 42n);
    expect(
      await storage.get(
        "zama:decrypt:0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa:0x1111111111111111111111111111111111111111:0x00000000000000000000000000000000000000000000000000000000000000ab",
      ),
    ).toBe(42n);
  });

  it("different handles produce different cache entries", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE2, 200n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(100n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE2)).toBe(200n);
  });

  it("isolates entries by requester", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(100n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_B, CONTRACT_A, HANDLE)).toBeNull();
  });

  it("isolates entries by contract address", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(100n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_B, HANDLE)).toBeNull();
  });

  it("handles zero value", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 0n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(0n);
  });

  it("persists and retrieves a boolean value", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, true);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(true);
  });

  it("persists and retrieves a false boolean value", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, false);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(false);
  });

  it("persists and retrieves an address value", async ({ storage }) => {
    const addr = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as `0x${string}`;
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, addr);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(addr);
  });

  it("is case-insensitive for requester, contract, and handle", async ({ storage }) => {
    const upperHandle = HANDLE.toUpperCase() as `0x${string}`;
    const lowerRequester = REQUESTER_A.toLowerCase() as `0x${string}`;
    const lowerContract = CONTRACT_A.toLowerCase() as `0x${string}`;
    await saveCachedUserDecryption(storage, lowerRequester, lowerContract, upperHandle, 999n);
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBe(999n);
  });

  it("does not throw when storage.get fails", async ({ storage }) => {
    storage.get = () => Promise.reject(new Error("storage unavailable"));
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
  });

  it("does not throw when storage.set fails", async ({ storage }) => {
    storage.set = () => Promise.reject(new Error("storage unavailable"));
    await expect(
      saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 42n),
    ).resolves.toBeUndefined();
  });

  it("tracks all keys when saves race", async ({ createMockStorage }) => {
    const storage = createMockStorage();

    await Promise.all([
      saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n),
      saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE2, 200n),
    ]);

    expect(await clearAllCachedDecryptions(storage)).toBeUndefined();
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE2)).toBeNull();
  });

  it("clearCachedUserDecryptions removes only matching requester entries", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    await saveCachedUserDecryption(storage, REQUESTER_B, CONTRACT_A, HANDLE2, 200n);

    await clearCachedUserDecryptions(storage, REQUESTER_A);

    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
    expect(await loadCachedUserDecryption(storage, REQUESTER_B, CONTRACT_A, HANDLE2)).toBe(200n);
  });

  it("clearCachedDecryptionsForContracts removes only matching contract entries", async ({
    storage,
  }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_B, HANDLE2, 200n);

    await clearCachedDecryptionsForContracts(storage, REQUESTER_A, [CONTRACT_A]);

    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_B, HANDLE2)).toBe(200n);
  });

  it("clearAllCachedDecryptions removes all cached entries", async ({ storage }) => {
    await saveCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE, 100n);
    await saveCachedUserDecryption(storage, REQUESTER_B, CONTRACT_B, HANDLE2, 200n);

    await clearAllCachedDecryptions(storage);

    expect(await loadCachedUserDecryption(storage, REQUESTER_A, CONTRACT_A, HANDLE)).toBeNull();
    expect(await loadCachedUserDecryption(storage, REQUESTER_B, CONTRACT_B, HANDLE2)).toBeNull();
  });

  it("clearAllCachedDecryptions is a no-op on empty storage", async ({ storage }) => {
    await expect(clearAllCachedDecryptions(storage)).resolves.toBeUndefined();
  });

  it("clearAllCachedDecryptions does not throw when storage fails", async ({ storage }) => {
    storage.get = () => Promise.reject(new Error("storage unavailable"));
    await expect(clearAllCachedDecryptions(storage)).resolves.toBeUndefined();
  });
});
