import { getAddress, type Address } from "viem";
import { describe, expect, test } from "../test-fixtures";
import type { Handle } from "../relayer/relayer-sdk.types";
import { CachingService } from "../services/caching-service";

const REQUESTER_A = getAddress("0x1111111111111111111111111111111111111111") as Address;
const REQUESTER_B = getAddress("0x2222222222222222222222222222222222222222") as Address;
const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as Handle;
const HANDLE_B = `0x${"bb".repeat(32)}` as Handle;

describe("CachingService", () => {
  test("returns null for cache misses", async ({ cache }) => {
    await expect(cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("stores decrypt values by requester, contract, and handle", async ({ cache }) => {
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 2n);
    await cache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, true);
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, getAddress(REQUESTER_B));

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(1n);
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(2n);
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBe(true);
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBe(getAddress(REQUESTER_B));
  });

  test("normalizes address and handle casing for lookups", async ({ cache }) => {
    await cache.set(
      REQUESTER_A.toLowerCase() as Address,
      CONTRACT_A.toLowerCase() as Address,
      HANDLE_A.toUpperCase() as Handle,
      7n,
    );

    await expect(
      cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A.toLowerCase() as Handle),
    ).resolves.toBe(7n);
  });

  test("clears only entries owned by a requester", async ({ cache }) => {
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_A, CONTRACT_B, HANDLE_B, 2n);
    await cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 3n);

    await cache.clearForRequester(REQUESTER_A);

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_B)).toBeNull();
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(3n);
  });

  test("clearAll removes all indexed cache entries", async ({ cache }) => {
    await cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cache.set(REQUESTER_B, CONTRACT_B, HANDLE_B, 2n);

    await cache.clearAll();

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_B, CONTRACT_B, HANDLE_B)).toBeNull();
  });

  test("invalid stored values behave as cache misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cache = new CachingService(storage);
    storage.get = async () => ({ value: 42n });

    await expect(cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage read failures degrade to cache misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cache = new CachingService(storage);

    storage.get = async () => {
      throw new Error("storage unavailable");
    };
    await expect(cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage write failures degrade to no-ops", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cache = new CachingService(storage);

    storage.set = async () => {
      throw new Error("storage full");
    };
    await expect(cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 42n)).resolves.toBeUndefined();
  });

  test("concurrent writes remain clearable", async ({ cache }) => {
    await Promise.all([
      cache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n),
      cache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, 2n),
      cache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, 3n),
      cache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 4n),
    ]);

    await cache.clearAll();

    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBeNull();
    expect(await cache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBeNull();
    expect(await cache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBeNull();
  });
});
