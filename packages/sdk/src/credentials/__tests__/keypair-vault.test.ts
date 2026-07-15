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

describe("TransportKeyPairVault scope (opt-in shared-tenant)", () => {
  test("two signers configured with the same scope share one key pair", async () => {
    const storage = new MemoryStorage();
    // One shared generator across both vaults: each vault getting its own generator
    // would make `fromA`/`fromB` trivially equal (both are each generator's
    // deterministic first call) regardless of whether the implementation under test
    // actually shares anything.
    const generator = makeGenerator();
    const scoped = () =>
      new TransportKeyPairVault({
        generator,
        storage,
        ttl: TTL_SECONDS,
        logger: makeLogger(),
        scope: "tenant-1",
      });

    const vaultA = scoped();
    const vaultB = scoped();

    const fromA = await vaultA.getOrCreate(USER);
    const fromB = await vaultB.getOrCreate(OTHER);
    expect(fromB).toEqual(fromA); // different signers, same scope → same key pair
    expect(await vaultA.readStored(OTHER)).toEqual(fromA); // signerAddress arg is ignored for storage keying
  });

  test("different scopes (and unscoped) never share a key pair", async () => {
    const storage = new MemoryStorage();
    // One shared generator (not one per vault) so each first-time call is guaranteed
    // a distinct key — three independent counters would each start at 1 and collide.
    const generator = makeGenerator();
    const vaultTenant1 = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });
    const vaultTenant2 = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-2",
    });
    const vaultUnscoped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });

    const tenant1Key = await vaultTenant1.getOrCreate(USER);
    const tenant2Key = await vaultTenant2.getOrCreate(USER);
    const unscopedKey = await vaultUnscoped.getOrCreate(USER);

    expect(tenant2Key).not.toEqual(tenant1Key);
    expect(unscopedKey).not.toEqual(tenant1Key);
    expect(unscopedKey).not.toEqual(tenant2Key);
  });

  test("clear() never deletes a scope's shared key pair — only clearScope() does", async () => {
    const storage = new MemoryStorage();
    const vaultA = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });
    const vaultB = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });

    const shared = await vaultA.getOrCreate(USER);

    // Signer-level teardown for USER must not touch the shared key pair: OTHER
    // (another signer in the same scope) still reads the same key afterwards.
    await vaultA.clear(USER);
    expect(await vaultB.readStored(OTHER)).toEqual(shared);

    // Only the scope-level operation can invalidate it.
    await vaultA.clearScope();
    expect(await vaultB.readStored(OTHER)).toBeNull();
  });

  test("clearScope() is a no-op when no scope is configured", async () => {
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });
    const before = await vault.getOrCreate(USER);
    await vault.clearScope();
    expect(await vault.readStored(USER)).toEqual(before);
  });

  test("clearScope() propagates a storage-delete failure instead of swallowing it", async () => {
    // Unlike clear() (best-effort, low-stakes), clearScope() is the primitive an
    // operator relies on for suspected-compromise rotation: a caller that gets a
    // resolved promise must be able to trust the key pair is actually gone. A
    // transient storage failure must surface, not be logged-and-dropped.
    const storage = new MemoryStorage();
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("delete boom"));
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
    });
    await vault.getOrCreate(USER);

    await expect(vault.clearScope()).rejects.toThrow("delete boom");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("warmScope() generates and persists the shared key pair, needing no signer address", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const vaultA = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });
    const vaultB = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });

    await vaultA.warmScope();
    // A signer that never calls warmScope itself still finds the pre-warmed key.
    const found = await vaultB.readStored(USER);
    expect(found).not.toBeNull();

    // Calling it again doesn't regenerate — it's idempotent, same as getOrCreate.
    await vaultA.warmScope();
    expect(await vaultB.readStored(USER)).toEqual(found);
    expect(generator).toHaveBeenCalledOnce();
  });

  test("warmScope() is a no-op when no scope is configured", async () => {
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });
    await vault.warmScope();
    expect(await vault.readStored(USER)).toBeNull();
  });

  test("warmScope() propagates a storage-set failure instead of swallowing it", async () => {
    // Unlike getOrCreate()'s ordinary best-effort persist, warmScope() is the primitive
    // an operator relies on to pre-warm before opening concurrent traffic — a resolved
    // promise must mean the key is actually in shared storage, not silently still absent
    // because a transient write failure was logged and dropped.
    const storage = new MemoryStorage();
    vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("set boom"));
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
    });

    await expect(vault.warmScope()).rejects.toThrow("set boom");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("clearScope() racing an in-flight getOrCreate() does not resurrect the rotated key", async () => {
    // Reproduces the TOCTOU window: a generation already in flight when clearScope()
    // is called must not persist behind the delete once its round trip completes —
    // otherwise the operator's resolved revokeTransportKeyPair() promise would be a lie.
    const storage = new MemoryStorage();
    let releaseGenerator!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGenerator = resolve;
    });
    const generator = vi.fn().mockImplementation(async () => {
      await gate; // held open until the test lets it through, after clearScope() resolves
      return {
        publicKey: PUBLIC_KEY,
        privateKey: PRIVATE_KEY,
      } as unknown as SerializeTransportKeyPairReturnType;
    });
    const vault = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });

    // Kick off a generation and let it block inside the generator (simulating a slow
    // relayer round trip) before clearScope() runs.
    const inFlight = vault.getOrCreate(USER);

    await vault.clearScope();

    // Only now does the stale generation's round trip complete and attempt to persist.
    releaseGenerator();
    await inFlight;

    // The rotation must win: no key pair resurrected in storage after clearScope()
    // resolved, even though a generation that predates it finished afterward.
    expect(await vault.readStored(USER)).toBeNull();
  });
});
