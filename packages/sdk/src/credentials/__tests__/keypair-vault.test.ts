import { test as baseTest, describe, expect, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import type { Address } from "viem";
import { KeypairVault } from "../keypair-vault";
import type { KeypairGenerator } from "../types";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const OTHER = "0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C" as Address;
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const TTL_SECONDS = 86400;

const test = baseTest.extend<{ vault: KeypairVault }>({
  // eslint-disable-next-line no-empty-pattern
  vault: async ({}, use) => {
    // Each call generates a unique keypair so cache hits/misses are observable
    // via equality without poking the generator's call count.
    let counter = 0;
    const generator: KeypairGenerator = {
      generateKeypair: vi.fn().mockImplementation(async () => {
        counter += 1;
        return {
          publicKey: (PUBLIC_KEY.slice(0, -2) +
            counter.toString(16).padStart(2, "0")) as `0x${string}`,
          privateKey: PRIVATE_KEY,
        };
      }),
    };
    await use(new KeypairVault({ generator, storage: new MemoryStorage(), ttl: TTL_SECONDS }));
  },
});

describe("KeypairVault", () => {
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

  test("treats malformed stored data as a cache miss and regenerates", async () => {
    let counter = 0;
    const generator: KeypairGenerator = {
      generateKeypair: vi.fn().mockImplementation(async () => {
        counter += 1;
        return {
          publicKey: (PUBLIC_KEY.slice(0, -2) +
            counter.toString(16).padStart(2, "0")) as `0x${string}`,
          privateKey: PRIVATE_KEY,
        };
      }),
    };
    const storage = new MemoryStorage();
    const vault = new KeypairVault({ generator, storage, ttl: TTL_SECONDS });

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
