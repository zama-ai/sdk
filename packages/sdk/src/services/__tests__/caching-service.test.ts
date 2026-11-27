import { getAddress, type Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { DerivationSecretHolder } from "../../credentials/keypair-wrapping";
import { MemoryStorage } from "../../storage/memory-storage";
import type { GenericStorage } from "../../types";
import { CachingService } from "../caching-service";
import { LoggerService } from "../logger-service";

const REQUESTER = getAddress("0x1111111111111111111111111111111111111111") as Address;
const CONTRACT = getAddress("0x2222222222222222222222222222222222222222") as Address;
const HANDLE = "0xabc" as const;

function throwingStorage(): GenericStorage {
  return {
    get: vi.fn(() => Promise.reject(new Error("storage down"))),
    set: vi.fn(() => Promise.reject(new Error("storage down"))),
    delete: vi.fn(() => Promise.reject(new Error("storage down"))),
  } as unknown as GenericStorage;
}

describe("CachingService logging", () => {
  test("a failed read is swallowed and produces no console output with a silent logger", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cache = new CachingService(throwingStorage(), new LoggerService());
      await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("a failed read routes through the injected logger at warn, with the [zama-sdk] prefix", async () => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const cache = new CachingService(throwingStorage(), new LoggerService(sink));
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
    expect(sink.warn).toHaveBeenCalledOnce();
    expect(sink.warn.mock.calls[0]![0]).toMatch(/^\[zama-sdk\] /);
    expect(sink.error).not.toHaveBeenCalled();
  });
});

describe("CachingService with a derivation secret", () => {
  const OTHER_HANDLE = "0xdef" as const;
  const key = (handle: string) => `zama:decrypt:${REQUESTER}:${CONTRACT}:${handle}`;

  function setup(secret = "a".repeat(64)) {
    const storage = new MemoryStorage();
    const cache = new CachingService(
      storage,
      new LoggerService(),
      new DerivationSecretHolder(secret),
    );
    return { storage, cache };
  }

  test.for([42n, true, CONTRACT] as const)("round-trips %s", async (value) => {
    const { cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, value);
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBe(value);
  });

  test("returns an address cached in lowercase", async () => {
    const { cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, CONTRACT.toLowerCase());
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBe(CONTRACT);
  });

  test("an entry stored without a tag is a miss and is removed", async () => {
    const { storage, cache } = setup();
    await storage.set(key(HANDLE), 42n);
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
    await expect(storage.get(key(HANDLE))).resolves.toBeNull();
  });

  test("an entry whose value differs from the tagged one is a miss", async () => {
    const { storage, cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, 42n);
    const entry = (await storage.get(key(HANDLE))) as { tag: string };
    await storage.set(key(HANDLE), { ...entry, value: 43n });
    await expect(cache.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
  });

  test("an entry moved to another key is a miss", async () => {
    const { storage, cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, 42n);
    await storage.set(key(OTHER_HANDLE), await storage.get(key(HANDLE)));
    await expect(cache.get(REQUESTER, CONTRACT, OTHER_HANDLE)).resolves.toBeNull();
  });

  test("an entry tagged with another secret is a miss", async () => {
    const { storage, cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, 42n);
    const other = new CachingService(
      storage,
      new LoggerService(),
      new DerivationSecretHolder("b".repeat(64)),
    );
    await expect(other.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
  });

  test("a tagged entry is a miss without a derivation secret", async () => {
    const { storage, cache } = setup();
    await cache.set(REQUESTER, CONTRACT, HANDLE, 42n);
    const plain = new CachingService(storage, new LoggerService());
    await expect(plain.get(REQUESTER, CONTRACT, HANDLE)).resolves.toBeNull();
  });
});
