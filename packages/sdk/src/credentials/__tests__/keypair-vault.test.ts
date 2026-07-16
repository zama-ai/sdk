import { test as baseTest, describe, expect, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import { TransportKeyPairVault } from "../keypair-vault";
import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { checksum } from "../utils";

const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");
const OTHER = checksum("0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C");
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const TTL_SECONDS = 86400;

const makeLogger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() });

function makeGenerator(): () => Promise<SerializeTransportKeyPairReturnType> {
  // Each call generates a unique keypair so cache hits/misses are observable
  // via equality without poking the generator's call count.
  let counter = 0;
  return vi.fn().mockImplementation(async () => {
    counter += 1;
    return {
      publicKey: (PUBLIC_KEY.slice(0, -2) +
        counter
          .toString(16)
          .padStart(2, "0")) as unknown as SerializeTransportKeyPairReturnType["publicKey"],
      privateKey: PRIVATE_KEY as unknown as SerializeTransportKeyPairReturnType["privateKey"],
    };
  });
}

const test = baseTest.extend<{ vault: TransportKeyPairVault }>({
  // eslint-disable-next-line no-empty-pattern
  vault: async ({}, use) => {
    await use(
      new TransportKeyPairVault({
        generator: makeGenerator(),
        storage: new MemoryStorage(),
        ttl: TTL_SECONDS,
        logger: makeLogger(),
      }),
    );
  },
});

describe("TransportKeyPairVault", () => {
  test("caches per address, dedupes concurrent calls, and isolates distinct addresses", async ({
    vault,
  }) => {
    const [a1, a2] = await Promise.all([vault.getOrCreate(USER), vault.getOrCreate(USER)]);
    expect(a2).toEqual(a1); // dedup → same keypair
    expect(await vault.getOrCreate(USER)).toEqual(a1); // cached
    expect(await vault.readStored(USER)).toEqual(a1);

    const other = await vault.getOrCreate(OTHER);
    expect(other).not.toEqual(a1); // distinct address → distinct keypair
  });

  test("clear() forces regeneration on the next getOrCreate", async ({ vault }) => {
    const before = await vault.getOrCreate(USER);
    await vault.clear(USER);
    expect(await vault.readStored(USER)).toBeNull();

    const after = await vault.getOrCreate(USER);
    expect(after).not.toEqual(before);
  });

  test("clear() routes a storage-delete failure to the logger", async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("delete boom"));
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
    });

    // clear() is best-effort: it must not reject, but the swallowed delete
    // failure should leave a breadcrumb when a logger is configured.
    await expect(vault.clear(USER)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "delete transport key pair entry failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  test("treats malformed stored data as a cache miss and regenerates", async () => {
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });

    // Seed storage with a real keypair, then corrupt the value out-of-band.
    // We use a wrapper-driven approach (stub `get` to return junk for the next
    // call) rather than poking the private storage-key naming.
    const stored = await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementationOnce(async () => ({ totally: "wrong shape" }));
    expect(await vault.readStored(USER)).toBeNull();

    // Restore real storage and confirm the next getOrCreate regenerates a
    // *different* keypair rather than handing back the corrupted one.
    vi.mocked(storage.get).mockImplementation(realGet);
    const regenerated = await vault.getOrCreate(USER);
    expect(regenerated).not.toEqual(stored);
  });

  test("regenerates after the TTL elapses", async ({ vault }) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const before = await vault.getOrCreate(USER);

      vi.advanceTimersByTime((TTL_SECONDS + 1) * 1000);
      expect(await vault.readStored(USER)).toBeNull();

      const after = await vault.getOrCreate(USER);
      expect(after).not.toEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
