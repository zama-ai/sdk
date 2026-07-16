import { getAddress, type Address } from "viem";
import { describe, expect, test } from "../test-fixtures";
import type { EncryptedValue } from "../relayer/types";
import { DecryptCache } from "../services/decrypt-cache";
import { LoggerService } from "../services/logger-service";

const REQUESTER_A = getAddress("0x1111111111111111111111111111111111111111") as Address;
const REQUESTER_B = getAddress("0x2222222222222222222222222222222222222222") as Address;
const CONTRACT_A = getAddress("0x3333333333333333333333333333333333333333") as Address;
const CONTRACT_B = getAddress("0x4444444444444444444444444444444444444444") as Address;
const HANDLE_A = `0x${"aa".repeat(32)}` as EncryptedValue;
const HANDLE_B = `0x${"bb".repeat(32)}` as EncryptedValue;
const HANDLE_C = `0x${"cc".repeat(32)}` as EncryptedValue;
const HANDLE_D = `0x${"dd".repeat(32)}` as EncryptedValue;

describe("DecryptCache", () => {
  test("returns null for decryptCache misses", async ({ decryptCache }) => {
    await expect(decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("stores decrypt values by requester, contract, and handle", async ({ decryptCache }) => {
    await decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await decryptCache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 2n);
    await decryptCache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, true);
    await decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, getAddress(REQUESTER_B));
    await decryptCache.set(REQUESTER_A, CONTRACT_B, HANDLE_C, 0n);
    await decryptCache.set(REQUESTER_A, CONTRACT_B, HANDLE_D, false);

    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBe(1n);
    expect(await decryptCache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(2n);
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBe(true);
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBe(getAddress(REQUESTER_B));
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_B, HANDLE_C)).toBe(0n);
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_B, HANDLE_D)).toBe(false);
  });

  test("normalizes address and handle casing for lookups", async ({ decryptCache }) => {
    await decryptCache.set(
      REQUESTER_A.toLowerCase() as Address,
      CONTRACT_A.toLowerCase() as Address,
      HANDLE_A.toUpperCase() as EncryptedValue,
      7n,
    );

    await expect(
      decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A.toLowerCase() as EncryptedValue),
    ).resolves.toBe(7n);
  });

  test("clears only entries owned by a requester", async ({ decryptCache }) => {
    await decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await decryptCache.set(REQUESTER_A, CONTRACT_B, HANDLE_B, 2n);
    await decryptCache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 3n);

    await decryptCache.clearForRequester(REQUESTER_A);

    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_B, HANDLE_B)).toBeNull();
    expect(await decryptCache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBe(3n);
  });

  test("clearAll removes all indexed decryptCache entries", async ({ decryptCache }) => {
    await decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n);
    await decryptCache.set(REQUESTER_B, CONTRACT_B, HANDLE_B, 2n);

    await decryptCache.clearAll();

    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await decryptCache.get(REQUESTER_B, CONTRACT_B, HANDLE_B)).toBeNull();
  });

  test("invalid stored values behave as decryptCache misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const decryptCache = new DecryptCache(storage, new LoggerService());
    storage.get = (async () => ({ value: 42n })) as typeof storage.get;

    await expect(decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage read failures degrade to decryptCache misses", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const decryptCache = new DecryptCache(storage, new LoggerService());

    storage.get = async () => {
      throw new Error("storage unavailable");
    };
    await expect(decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).resolves.toBeNull();
  });

  test("storage write failures degrade to no-ops", async ({ createMockStorage }) => {
    const storage = createMockStorage();
    const decryptCache = new DecryptCache(storage, new LoggerService());

    storage.set = async () => {
      throw new Error("storage full");
    };
    await expect(decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 42n)).resolves.toBeUndefined();
  });

  test("concurrent writes remain clearable", async ({ decryptCache }) => {
    await Promise.all([
      decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_A, 1n),
      decryptCache.set(REQUESTER_A, CONTRACT_A, HANDLE_B, 2n),
      decryptCache.set(REQUESTER_A, CONTRACT_B, HANDLE_A, 3n),
      decryptCache.set(REQUESTER_B, CONTRACT_A, HANDLE_A, 4n),
    ]);

    await decryptCache.clearAll();

    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_A)).toBeNull();
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_A, HANDLE_B)).toBeNull();
    expect(await decryptCache.get(REQUESTER_A, CONTRACT_B, HANDLE_A)).toBeNull();
    expect(await decryptCache.get(REQUESTER_B, CONTRACT_A, HANDLE_A)).toBeNull();
  });
});
