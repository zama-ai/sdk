import { describe, expect, test, type Mock } from "../test-fixtures";
import { DecryptCache } from "../decrypt-cache";
import type { Handle } from "../relayer/relayer-sdk.types";
import { getAddress, type Address } from "viem";

// ---------------------------------------------------------------------------
// Test addresses and handles
// ---------------------------------------------------------------------------

const REQUESTER_A = getAddress("0x1111111111111111111111111111111111111111") as Address;
const REQUESTER_B = getAddress("0x2222222222222222222222222222222222222222") as Address;
const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = ("0x" + "aa".repeat(32)) as Handle;
const HANDLE_B = ("0x" + "bb".repeat(32)) as Handle;

describe("DecryptCache", () => {
  // -------------------------------------------------------------------------
  // Cache miss
  // -------------------------------------------------------------------------

  test("cache miss returns null", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    const result = await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Persist & retrieve various value types
  // -------------------------------------------------------------------------

  test("persists and retrieves a bigint", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 42n);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(42n);
  });

  test("persists and retrieves zero bigint", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 0n);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(0n);
  });

  test("persists and retrieves boolean true", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, true);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(true);
  });

  test("persists and retrieves boolean false", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, false);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(false);
  });

  test("persists and retrieves an address (hex string)", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    const addr = getAddress("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12") as Address;
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, addr);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(addr);
  });

  // -------------------------------------------------------------------------
  // Isolation by requester / contract / handle
  // -------------------------------------------------------------------------

  test("isolates entries by requester", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 2n);

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(1n);
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(2n);
  });

  test("isolates entries by contract", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 10n);
    await cache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, 20n);

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(10n);
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBe(20n);
  });

  test("different handles produce different entries", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 100n);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, 200n);

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(100n);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBe(200n);
  });

  // -------------------------------------------------------------------------
  // Case-insensitivity
  // -------------------------------------------------------------------------

  test("is case-insensitive for addresses", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    // Use lowercase hex (valid address format) vs checksummed — both should resolve
    // to the same key after getAddress() normalisation.
    const lower = REQUESTER_A.toLowerCase() as Address;
    // Checksummed form is the canonical form returned by getAddress()
    const checksummed = getAddress(REQUESTER_A);

    await cache.set(lower, CONTRACT_A, HANDLE_A, 7n);
    expect(await cache.get(checksummed, CONTRACT_A, HANDLE_A)).toBe(7n);
  });

  test("is case-insensitive for handles", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    const lowerHandle = HANDLE_A.toLowerCase() as Handle;
    const upperHandle = HANDLE_A.toUpperCase() as Handle;

    await cache.set(REQUESTER_A, CONTRACT_A, lowerHandle, 9n);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, upperHandle)).toBe(9n);
  });

  // -------------------------------------------------------------------------
  // clearForRequester
  // -------------------------------------------------------------------------

  test("clearForRequester removes only entries for the given requester", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_A, CONTRACT_B, HANDLE_B, 2n);
    await cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 3n);

    await cache.clearForRequester(REQUESTER_A);

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_B)).toBeNull();
    // REQUESTER_B entry should still be there
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(3n);
  });

  // -------------------------------------------------------------------------
  // clearAll
  // -------------------------------------------------------------------------

  test("clearAll removes all entries", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_B, CONTRACT_B, HANDLE_B, 2n);

    await cache.clearAll();

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_B, CONTRACT_B, HANDLE_B)).toBeNull();
  });

  test("clearAll is a no-op on empty storage", async ({ storage }) => {
    const cache = new DecryptCache(storage);
    await expect(cache.clearAll()).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Error resilience
  // -------------------------------------------------------------------------

  test("does not throw when storage.get fails", async ({ createMockStorage }) => {
    const mockStorage = createMockStorage();
    (mockStorage.get as Mock).mockRejectedValue(new Error("storage failure"));
    const cache = new DecryptCache(mockStorage);
    await expect(cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("does not throw when storage.set fails", async ({ createMockStorage }) => {
    const mockStorage = createMockStorage();
    (mockStorage.set as Mock).mockRejectedValue(new Error("storage failure"));
    const cache = new DecryptCache(mockStorage);
    await expect(cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 42n)).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Concurrent sets do not lose tracked keys
  // -------------------------------------------------------------------------

  test("concurrent sets do not lose tracked keys", async ({ storage }) => {
    const cache = new DecryptCache(storage);

    // Fire multiple sets concurrently — all should survive in the index
    await Promise.all([
      cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n),
      cache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, 2n),
      cache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, 3n),
      cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 4n),
    ]);

    // All values should be retrievable
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(1n);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBe(2n);
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBe(3n);
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(4n);

    // clearAll should remove everything — if index is partial, some entries would leak
    await cache.clearAll();
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBeNull();
  });
});
