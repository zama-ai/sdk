import { getAddress, type Address } from "viem";
import { describe, expect, test } from "../test-fixtures";
import type { EncryptedValue } from "../relayer/types";
import { CachingService } from "../services/caching-service";

const REQUESTER_A = getAddress("0x1111111111111111111111111111111111111111") as Address;
const REQUESTER_B = getAddress("0x2222222222222222222222222222222222222222") as Address;
const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as EncryptedValue;
const HANDLE_B = `0x${"bb".repeat(32)}` as EncryptedValue;
const HANDLE_C = `0x${"cc".repeat(32)}` as EncryptedValue;
const HANDLE_D = `0x${"dd".repeat(32)}` as EncryptedValue;

describe("CachingService", () => {
  test("returns null for cachingService misses", async ({ cachingService }) => {
    await expect(cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("stores decrypt values by requester, contract, and handle", async ({ cachingService }) => {
    await cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cachingService.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 2n);
    await cachingService.set(REQUESTER_A, CONTRACT_B, HANDLE_A, true);
    await cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_B, getAddress(REQUESTER_B));
    await cachingService.set(REQUESTER_A, CONTRACT_B, HANDLE_C, 0n);
    await cachingService.set(REQUESTER_A, CONTRACT_B, HANDLE_D, false);

    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(1n);
    expect(await cachingService.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(2n);
    expect(await cachingService.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBe(true);
    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBe(
      getAddress(REQUESTER_B),
    );
    expect(await cachingService.get(REQUESTER_A, CONTRACT_B, HANDLE_C)).toBe(0n);
    expect(await cachingService.get(REQUESTER_A, CONTRACT_B, HANDLE_D)).toBe(false);
  });

  test("normalizes address and handle casing for lookups", async ({ cachingService }) => {
    await cachingService.set(
      REQUESTER_A.toLowerCase() as Address,
      CONTRACT_A.toLowerCase() as Address,
      HANDLE_A.toUpperCase() as EncryptedValue,
      7n,
    );

    await expect(
      cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A.toLowerCase() as EncryptedValue),
    ).resolves.toBe(7n);
  });

  test("clears only entries owned by a requester", async ({ cachingService }) => {
    await cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cachingService.set(REQUESTER_A, CONTRACT_B, HANDLE_B, 2n);
    await cachingService.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 3n);

    await cachingService.clearForRequester(REQUESTER_A);

    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cachingService.get(REQUESTER_A, CONTRACT_B, HANDLE_B)).toBeNull();
    expect(await cachingService.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(3n);
  });

  test("clearAll removes all indexed cachingService entries", async ({ cachingService }) => {
    await cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await cachingService.set(REQUESTER_B, CONTRACT_B, HANDLE_B, 2n);

    await cachingService.clearAll();

    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cachingService.get(REQUESTER_B, CONTRACT_B, HANDLE_B)).toBeNull();
  });

  test("invalid stored values behave as cachingService misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cachingService = new CachingService(storage);
    storage.get = async () => ({ value: 42n });

    await expect(cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage read failures degrade to cachingService misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cachingService = new CachingService(storage);

    storage.get = async () => {
      throw new Error("storage unavailable");
    };
    await expect(cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage write failures degrade to no-ops", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const cachingService = new CachingService(storage);

    storage.set = async () => {
      throw new Error("storage full");
    };
    await expect(
      cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 42n),
    ).resolves.toBeUndefined();
  });

  test("concurrent writes remain clearable", async ({ cachingService }) => {
    await Promise.all([
      cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n),
      cachingService.set(REQUESTER_A, CONTRACT_A, HANDLE_B, 2n),
      cachingService.set(REQUESTER_A, CONTRACT_B, HANDLE_A, 3n),
      cachingService.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 4n),
    ]);

    await cachingService.clearAll();

    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await cachingService.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBeNull();
    expect(await cachingService.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBeNull();
    expect(await cachingService.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBeNull();
  });
});
