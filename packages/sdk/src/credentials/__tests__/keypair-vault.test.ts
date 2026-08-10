import { test as baseTest, describe, expect, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import { TransportKeyPairVault } from "../keypair-vault";
import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { KeyWrappingError } from "../../errors/credential";
import { DerivationSecretHolder, WRAPPING_SCHEME_V1 } from "../keypair-wrapping";
import { transportKeyPairScopeStorageKey, transportKeyPairStorageKey } from "../storage-keys";
import { checksum } from "../utils";

const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");
const OTHER = checksum("0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C");
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const TTL_SECONDS = 86400;

const holder = (secret: string | Uint8Array) => new DerivationSecretHolder(secret);

const makeLogger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() });

/**
 * Deep-serialize a logged argument into a searchable string, unfolding the fields
 * `JSON.stringify` drops by default — `Error` internals (message/stack/cause) and
 * `Uint8Array` bytes — so a leaked `derivationSecret` can't hide inside any of them.
 */
function serializeLoggedArg(arg: unknown): string {
  return JSON.stringify(arg, (_key, value: unknown) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack, cause: value.cause };
    }
    if (value instanceof Uint8Array) {
      return Array.from(value);
    }
    return value;
  });
}

type MockLogger = ReturnType<typeof makeLogger>;

/** Flatten every argument passed to every method of the given loggers into one string. */
function allLoggedText(loggers: MockLogger[]): string {
  return loggers
    .flatMap((logger) => [
      ...logger.error.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.info.mock.calls,
      ...logger.debug.mock.calls,
    ])
    .flat()
    .map(serializeLoggedArg)
    .join("\n");
}

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

  test("persists and round-trips the generator's tkmsVersion", async () => {
    const vault = new TransportKeyPairVault({
      generator: async () => ({
        publicKey: PUBLIC_KEY as unknown as SerializeTransportKeyPairReturnType["publicKey"],
        privateKey: PRIVATE_KEY as unknown as SerializeTransportKeyPairReturnType["privateKey"],
        tkmsVersion: "v1",
      }),
      storage: new MemoryStorage(),
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });

    const created = await vault.getOrCreate(USER);
    expect(created.tkmsVersion).toBe("v1");
    // Survives the schema round-trip on read (the field must not be stripped).
    expect((await vault.readStored(USER))?.tkmsVersion).toBe("v1");
  });

  test("stores no tkmsVersion when the generator omits it", async ({ vault }) => {
    const created = await vault.getOrCreate(USER);
    expect(created.tkmsVersion).toBeUndefined();
    expect(await vault.readStored(USER)).not.toHaveProperty("tkmsVersion");
  });

  test("evict() forces regeneration on the next getOrCreate", async ({ vault }) => {
    const before = await vault.getOrCreate(USER);
    await vault.evict(USER);
    expect(await vault.readStored(USER)).toBeNull();

    const after = await vault.getOrCreate(USER);
    expect(after).not.toEqual(before);
  });

  test("evict() is scope-aware and drops the shared key regardless of address", async () => {
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage: new MemoryStorage(),
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-a",
    });
    const before = await vault.getOrCreate(USER);

    // Unlike clear() (per-signer), evict() targets the scope identity — so a
    // different signer address still removes the shared key the whole scope reads.
    await vault.evict(OTHER);
    expect(await vault.readStored(USER)).toBeNull();

    const after = await vault.getOrCreate(USER);
    expect(after).not.toEqual(before);
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

  test("warmScope() keeps its not-best-effort guarantee even when a concurrent getOrCreate() on the same scope registers first", async () => {
    // Reproduces the #pending dedup bug: a strict caller (warmScope) and a non-strict
    // caller (getOrCreate) targeting the same shared scope identity must never adopt
    // each other's persistence guarantee — whichever registers its pending promise
    // first must not silently impose its strictness on the other.
    const storage = new MemoryStorage();
    vi.spyOn(storage, "set").mockRejectedValue(new Error("set boom"));
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
    });

    // Fire both back-to-back, before either resolves, so a naive identity-only
    // dedup key would have the non-strict call's promise win for both.
    const nonStrict = vault.getOrCreate(USER);
    const strict = vault.warmScope();

    // getOrCreate() is best-effort: the storage.set failure is logged and swallowed,
    // and it still resolves with the freshly generated (unpersisted) key pair.
    await expect(nonStrict).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalled();

    // warmScope() must still honor its own not-best-effort contract regardless.
    await expect(strict).rejects.toThrow("set boom");
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

describe("TransportKeyPairVault derivationSecret (opt-in at-rest wrapping)", () => {
  const SECRET_A = "correct-horse-battery-staple";
  const SECRET_B = "a-different-secret";

  test("round-trips through storage: a second vault instance reads and unwraps it", async () => {
    const storage = new MemoryStorage();
    const vaultA = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const vaultB = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    const created = await vaultA.getOrCreate(USER);
    expect(await vaultB.readStored(USER)).toEqual(created);
  });

  test("regression guard: no wrapping when derivationSecret is absent — persisted value stays a plain privateKey", async () => {
    const storage = new MemoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });

    await vault.getOrCreate(USER);

    expect(setSpy).toHaveBeenCalledOnce();
    const persisted = setSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(persisted.privateKey).toBe(PRIVATE_KEY);
    expect(persisted.wrappedPrivateKey).toBeUndefined();
    expect(persisted.iv).toBeUndefined();
  });

  test("when configured, the persisted value never contains the plaintext private key", async () => {
    const storage = new MemoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    await vault.getOrCreate(USER);

    expect(setSpy).toHaveBeenCalledOnce();
    const persisted = setSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(persisted.privateKey).toBeUndefined();
    expect(persisted.wrappedPrivateKey).toBeDefined();
    expect(persisted.wrappedPrivateKey).not.toBe(PRIVATE_KEY);
    expect(persisted.iv).toBeDefined();
    expect(persisted.wrappingVersion).toBe(WRAPPING_SCHEME_V1.version);
  });

  test("wrong secret is treated as a cache miss and regenerates — not a crash", async () => {
    const storage = new MemoryStorage();
    // Shared generator: two independent ones would each return their own deterministic
    // first-call key, making the two calls below coincidentally equal regardless of
    // whether regeneration actually happened.
    const generator = makeGenerator();
    const vaultA = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const vaultB = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_B),
    });

    const created = await vaultA.getOrCreate(USER);
    await expect(vaultB.readStored(USER)).resolves.toBeNull();

    const regenerated = await vaultB.getOrCreate(USER);
    expect(regenerated).not.toEqual(created);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  test("a pre-existing plaintext entry is a cache miss once derivationSecret is turned on — regenerates wrapped", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const unwrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
    });
    const wrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    const plaintextEntry = await unwrapped.getOrCreate(USER);
    expect(await wrapped.readStored(USER)).toBeNull();

    const regenerated = await wrapped.getOrCreate(USER);
    expect(regenerated).not.toEqual(plaintextEntry);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  test("a pre-existing wrapped entry is a cache miss once derivationSecret is turned off — regenerates plaintext", async () => {
    const storage = new MemoryStorage();
    const wrapped = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const unwrappedLogger = makeLogger();
    const unwrapped = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: unwrappedLogger,
    });

    await wrapped.getOrCreate(USER);
    expect(await unwrapped.readStored(USER)).toBeNull();
    // Losing at-rest wrapping on the regenerated entry is a downgrade, so the discard
    // is never silent even though it self-heals.
    expect(unwrappedLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("no transportKeyPairDerivationSecret is configured"),
      expect.objectContaining({ key: expect.any(String) }),
    );
  });

  test("regenerates a wrapped entry after the TTL elapses", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const storage = new MemoryStorage();
      const vault = new TransportKeyPairVault({
        generator: makeGenerator(),
        storage,
        ttl: TTL_SECONDS,
        logger: makeLogger(),
        derivationSecret: holder(SECRET_A),
      });

      const before = await vault.getOrCreate(USER);

      vi.advanceTimersByTime((TTL_SECONDS + 1) * 1000);
      // expiresAt is authenticated as AAD, so an expired wrapped entry still unwraps
      // cleanly — only the TTL check keeps it from being served past its lifetime.
      expect(await vault.readStored(USER)).toBeNull();
      expect(await storage.get(transportKeyPairStorageKey(USER))).toBeNull();

      const after = await vault.getOrCreate(USER);
      expect(after.publicKey).not.toBe(before.publicKey);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a wrapped entry transplanted onto another signer's storage key cannot be unwrapped", async () => {
    // The wrapping key is derived with the signer identity as HKDF salt, so lifting one
    // signer's ciphertext into another's slot must not hand the second signer a working
    // key pair — even though both entries are wrapped under the same secret.
    const storage = new MemoryStorage();
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      derivationSecret: holder(SECRET_A),
    });

    const forUser = await vault.getOrCreate(USER);
    const rawForUser = await storage.get(transportKeyPairStorageKey(USER));
    await storage.set(transportKeyPairStorageKey(OTHER), rawForUser);

    expect(await vault.readStored(OTHER)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to unwrap"),
      expect.objectContaining({ key: expect.any(String) }),
    );

    const forOther = await vault.getOrCreate(OTHER);
    expect(forOther.publicKey).not.toBe(forUser.publicKey);
    // USER's own entry is untouched by the transplant and still reads back.
    expect(await vault.readStored(USER)).toEqual(forUser);
  });

  test("composes with scope: two different signers, same scope and secret, derive the same wrapping key", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const scopedAndWrapped = () =>
      new TransportKeyPairVault({
        generator,
        storage,
        ttl: TTL_SECONDS,
        logger: makeLogger(),
        scope: "tenant-1",
        derivationSecret: holder(SECRET_A),
      });

    const vaultA = scopedAndWrapped();
    const vaultB = scopedAndWrapped();

    // vaultA (identity USER, but scoped) wraps with salt "tenant-1", not USER's address.
    const created = await vaultA.getOrCreate(USER);
    // vaultB reads under a *different* signer address, same scope: must still unwrap.
    const read = await vaultB.readStored(OTHER);
    expect(read).toEqual(created);
  });

  test("clearScope() racing an in-flight getOrCreate() does not resurrect the rotated key when wrapping is on", async () => {
    // Same TOCTOU window as the unwrapped case, but the wrapped persist path runs the
    // extra wrap round trip after the generator; the epoch check must still gate the
    // write that lands behind clearScope()'s delete.
    const storage = new MemoryStorage();
    let releaseGenerator!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGenerator = resolve;
    });
    const generator = vi.fn().mockImplementation(async () => {
      await gate;
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
      derivationSecret: holder(SECRET_A),
    });

    const inFlight = vault.getOrCreate(USER);
    await vault.clearScope();

    releaseGenerator();
    await inFlight;

    expect(await storage.get(transportKeyPairScopeStorageKey("tenant-1"))).toBeNull();
    expect(await vault.readStored(USER)).toBeNull();
  });

  test("round-trips tkmsVersion through a wrapped entry, where it also participates in the AAD", async () => {
    const storage = new MemoryStorage();
    const wrappedVault = (logger = makeLogger()) =>
      new TransportKeyPairVault({
        generator: async () => ({
          publicKey: PUBLIC_KEY as unknown as SerializeTransportKeyPairReturnType["publicKey"],
          privateKey: PRIVATE_KEY as unknown as SerializeTransportKeyPairReturnType["privateKey"],
          tkmsVersion: "v1",
        }),
        storage,
        ttl: TTL_SECONDS,
        logger,
        derivationSecret: holder(SECRET_A),
      });

    const created = await wrappedVault().getOrCreate(USER);
    expect(created.tkmsVersion).toBe("v1");

    // A second instance decrypting successfully proves it reconstructed the exact AAD,
    // tkmsVersion included: a dropped or altered field would fail authentication.
    expect(await wrappedVault().readStored(USER)).toEqual(created);

    const persisted = (await storage.get(transportKeyPairStorageKey(USER))) as Record<
      string,
      unknown
    >;
    expect(persisted.tkmsVersion).toBe("v1");
    expect(persisted.wrappedPrivateKey).toBeDefined();
    expect(persisted.privateKey).toBeUndefined();
  });

  test("stores no tkmsVersion in a wrapped entry when the generator omits it", async () => {
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    const created = await vault.getOrCreate(USER);
    expect(created.tkmsVersion).toBeUndefined();
    expect(await storage.get(transportKeyPairStorageKey(USER))).not.toHaveProperty("tkmsVersion");
    expect(await vault.readStored(USER)).not.toHaveProperty("tkmsVersion");
  });

  test("logs the unwrap-failure reason directly, unconditionally (not just when storage.delete() itself fails)", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const vaultA = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const loggerB = makeLogger();
    const vaultB = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: loggerB,
      derivationSecret: holder(SECRET_B),
    });

    await vaultA.getOrCreate(USER);
    await vaultB.readStored(USER);

    expect(loggerB.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to unwrap"),
      expect.objectContaining({ key: expect.any(String) }),
    );
  });

  test("a scoped entry that fails to unwrap is never clobbered — getOrCreate throws instead of silently regenerating", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const correctlyConfigured = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    const misconfiguredLogger = makeLogger();
    const misconfigured = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: misconfiguredLogger,
      scope: "tenant-1",
      derivationSecret: holder(SECRET_B),
    });

    const created = await correctlyConfigured.getOrCreate(USER);

    // The misconfigured peer must fail loudly, not silently regenerate and overwrite
    // the scope's shared entry — that would force every signer in the scope to
    // re-authenticate for no reason of their own.
    await expect(misconfigured.getOrCreate(OTHER)).rejects.toThrow(/scope "tenant-1"/);
    expect(misconfiguredLogger.error).toHaveBeenCalled();

    // The correctly-configured instance's entry must still be intact and unchanged.
    expect(await correctlyConfigured.readStored(USER)).toEqual(created);
  });

  test("an unscoped entry that fails to unwrap still self-heals (regenerates), unlike the scoped case", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const vaultA = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const vaultB = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_B),
    });

    await vaultA.getOrCreate(USER);
    const regenerated = await vaultB.getOrCreate(USER);

    expect(regenerated).toBeDefined();
    await expect(vaultB.readStored(USER)).resolves.toEqual(regenerated);
  });

  test("a non-authentication unwrap failure (e.g. crypto.subtle malfunctioning) propagates instead of being treated as a cache miss", async () => {
    const storage = new MemoryStorage();
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      derivationSecret: holder(SECRET_A),
    });
    await vault.getOrCreate(USER);

    const decryptSpy = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));

    // Surfaces as a typed KeyWrappingError (not the raw DOMException/TypeError) so
    // callers can `instanceof ZamaError` it — the original failure is preserved as
    // `.cause` rather than lost.
    const error: unknown = await vault.readStored(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("crypto.subtle is unavailable"),
      }),
    });
    expect(logger.error).toHaveBeenCalledWith(
      "transport key pair unwrap failed unexpectedly",
      expect.objectContaining({ key: expect.any(String) }),
    );

    decryptSpy.mockRestore();
  });

  test("a wrap-time failure (e.g. crypto.subtle malfunctioning) propagates as a typed KeyWrappingError, not swallowed", async () => {
    // Unlike the ordinary best-effort `storage.set` failure, a failure to *wrap* the
    // key in the first place is not a persistence hiccup — the caller gets back a
    // rejected promise instead of a keypair, so it can't be silently swallowed the
    // way a storage write failure is.
    const storage = new MemoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));

    const error: unknown = await vault.getOrCreate(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(setSpy).not.toHaveBeenCalled();

    encryptSpy.mockRestore();
  });

  test("schema rejects a structurally invalid wrapped entry pre-decrypt, avoiding the ambiguous OperationError path", async () => {
    // A truncated/corrupted iv can't possibly be a real 12-byte AES-GCM nonce —
    // WrappedPrivateKeyEntrySchema catches that before it ever reaches
    // crypto.subtle.decrypt, where it would otherwise fail with the exact same
    // generic OperationError a genuine wrong-derivationSecret case produces.
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const created = await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementationOnce(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      return { ...raw, iv: "0xaabb" }; // 2 bytes, not the required 12
    });

    const decryptSpy = vi.spyOn(crypto.subtle, "decrypt");
    const regenerated = await vault.getOrCreate(USER);
    expect(decryptSpy).not.toHaveBeenCalled();
    expect(regenerated).not.toEqual(created);
    decryptSpy.mockRestore();
  });

  test("a scoped entry that is structurally corrupted (fails schema validation) is never clobbered either — fails loudly like the OperationError case", async () => {
    // A truncated iv fails WrappedPrivateKeyEntrySchema before decrypt is ever attempted
    // (see the previous test). For a *scoped* vault, that structural-failure path must be
    // just as strict as the OperationError path above — silently discarding and
    // regenerating here would clobber the scope's shared entry via a different code path
    // than the one the OperationError fix already closed.
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      return { ...raw, iv: "0xaabb" }; // 2 bytes, not the required 12 — structurally invalid
    });

    // A structurally invalid entry gets the corruption/version-mismatch diagnostic, not
    // the "a peer is running without the secret" one: the operator actions differ.
    const error: unknown = await vault.readStored(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining("wrapped but structurally invalid"),
    });
    expect(error).toMatchObject({
      message: expect.stringContaining(
        "corrupted, or instances sharing this scope are running mismatched wrapping-scheme versions",
      ),
    });
    expect((error as Error).message).not.toContain("running without the secret");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("wrapped but structurally invalid"),
      expect.objectContaining({ key: expect.any(String) }),
    );
    // The corrupted entry must never be deleted — a failed read must not clobber it.
    expect(deleteSpy).not.toHaveBeenCalled();

    // A second read hits the same corrupted entry again — proving it survived, not that
    // it was silently discarded-and-regenerated behind the scenes.
    await expect(vault.readStored(USER)).rejects.toThrow(/scope "tenant-1"/);
  });

  test("a scoped entry with a corrupted ciphertext is never clobbered either", async () => {
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      // Truncated below the AES-GCM authentication tag: structurally impossible ciphertext.
      return { ...raw, wrappedPrivateKey: `0x${"cc".repeat(8)}` };
    });

    const error: unknown = await vault.readStored(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining("wrapped but structurally invalid"),
    });
    expect(logger.error).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("a scoped entry that is recognizably wrapped but corrupted fails loudly when no derivationSecret is configured", async () => {
    // The loud no-secret failure keys off the wrapped envelope, not a clean schema parse:
    // a corrupted entry still belongs to a peer that may be able to read it.
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const wrapped = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    const unwrapped = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
    });

    await wrapped.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      return { ...raw, iv: "0xaabb" }; // 2 bytes, not the required 12
    });

    const error: unknown = await unwrapped.readStored(OTHER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining("no transportKeyPairDerivationSecret configured"),
    });
    expect(logger.error).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("an unscoped entry written under an unrecognized wrappingVersion is preserved, not regenerated over", async () => {
    // Only a build that knows the scheme can read the ciphertext, so even the unscoped
    // vault fails closed rather than self-healing: regenerating would destroy it for good.
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const generator = makeGenerator();
    const vault = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    const rawBefore = await realGet(transportKeyPairStorageKey(USER));
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      return { ...raw, wrappingVersion: WRAPPING_SCHEME_V1.version + 1 };
    });

    const error: unknown = await vault.getOrCreate(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining(`wrappingVersion ${WRAPPING_SCHEME_V1.version + 1}`),
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();

    vi.mocked(storage.get).mockImplementation(realGet);
    expect(await storage.get(transportKeyPairStorageKey(USER))).toEqual(rawBefore);
  });

  test("a scoped entry written under an unrecognized wrappingVersion is preserved and names the scope", async () => {
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const raw = (await realGet(key)) as Record<string, unknown>;
      return { ...raw, wrappingVersion: WRAPPING_SCHEME_V1.version + 1 };
    });

    const error: unknown = await vault.readStored(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({ message: expect.stringContaining('scope "tenant-1"') });
    expect(error).toMatchObject({
      message: expect.stringContaining("permits.revokeTransportKeyPair()"),
    });
    expect(logger.error).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("an entry with a missing wrappingVersion is preserved as an unreadable scheme, not discarded as junk", async () => {
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    await vault.getOrCreate(USER);
    const realGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementation(async (key: string) => {
      const { wrappingVersion: _dropped, ...raw } = (await realGet(key)) as Record<string, unknown>;
      return raw;
    });

    const error: unknown = await vault.readStored(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining("no wrappingVersion this build recognizes"),
    });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test("a scoped plaintext entry read by a secret-configured instance fails loudly instead of self-healing", async () => {
    // A plaintext entry on a scope that this instance wraps means a peer is running
    // without the secret; regenerating wrapped would clobber the peer's entry.
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const unwrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
    });
    const wrappedLogger = makeLogger();
    const wrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: wrappedLogger,
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });

    const plaintextEntry = await unwrapped.getOrCreate(USER);
    const rawBefore = await storage.get(transportKeyPairScopeStorageKey("tenant-1"));

    const error: unknown = await wrapped.getOrCreate(OTHER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({ message: expect.stringContaining('scope "tenant-1"') });
    // A recognizably plaintext entry pins the diagnosis on a peer running without the
    // secret, with the concrete fix — not the generic corruption/version-mismatch text.
    expect(error).toMatchObject({
      message: expect.stringContaining("A peer instance sharing this scope is running without"),
    });
    expect(error).toMatchObject({
      message: expect.stringContaining("permits.revokeTransportKeyPair()"),
    });
    expect((error as Error).message).not.toContain("not a recognized");
    expect(wrappedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("is stored unwrapped"),
      expect.objectContaining({ key: expect.any(String) }),
    );
    expect(generator).toHaveBeenCalledTimes(1);
    expect(await storage.get(transportKeyPairScopeStorageKey("tenant-1"))).toEqual(rawBefore);
    expect(await unwrapped.readStored(USER)).toEqual(plaintextEntry);
  });

  test("a scoped wrapped entry read by an instance with no derivationSecret fails loudly instead of self-healing", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const wrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: "tenant-1",
      derivationSecret: holder(SECRET_A),
    });
    const unwrappedLogger = makeLogger();
    const unwrapped = new TransportKeyPairVault({
      generator,
      storage,
      ttl: TTL_SECONDS,
      logger: unwrappedLogger,
      scope: "tenant-1",
    });

    const created = await wrapped.getOrCreate(USER);
    const rawBefore = await storage.get(transportKeyPairScopeStorageKey("tenant-1"));

    const error: unknown = await unwrapped.getOrCreate(OTHER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({ message: expect.stringContaining('scope "tenant-1"') });
    expect(unwrappedLogger.error).toHaveBeenCalled();
    expect(generator).toHaveBeenCalledTimes(1);
    expect(await storage.get(transportKeyPairScopeStorageKey("tenant-1"))).toEqual(rawBefore);
    expect(await wrapped.readStored(USER)).toEqual(created);
  });

  test("a scoped, genuinely malformed entry still self-heals when no derivationSecret is configured", async () => {
    // The loud scoped failure is reserved for entries that are *recognizably wrapped* — an
    // entry that is neither wrapped nor plaintext carries no peer's key pair to protect, so
    // discarding it must stay the ordinary self-heal instead of wedging the whole scope.
    const storage = new MemoryStorage();
    const logger = makeLogger();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger,
      scope: "tenant-1",
    });
    await storage.set(transportKeyPairScopeStorageKey("tenant-1"), { publicKey: PUBLIC_KEY });

    await expect(vault.readStored(USER)).resolves.toBeNull();
    expect(logger.error).not.toHaveBeenCalled();

    const regenerated = await vault.getOrCreate(USER);
    expect(await vault.readStored(USER)).toEqual(regenerated);
  });

  test("a scope named after a signer address derives a different wrapping key than that signer", async () => {
    // The HKDF salt is namespaced by identity kind, so a scope string that happens to equal
    // a checksummed signer address can never unwrap that signer's per-signer entry.
    const storage = new MemoryStorage();
    const perSigner = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });
    const scopedAsAddress = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      scope: USER,
      derivationSecret: holder(SECRET_A),
    });

    await perSigner.getOrCreate(USER);
    const signerEntry = await storage.get(transportKeyPairStorageKey(USER));
    await storage.set(transportKeyPairScopeStorageKey(USER), signerEntry);

    await expect(scopedAsAddress.readStored(USER)).rejects.toThrow(KeyWrappingError);
  });

  test("never leaks the derivationSecret value into any log line, on any path (leak regression)", async () => {
    // The secret lives only as a private field inside this vault — the one component that
    // both holds it and writes log lines. It's absent from every log payload today (each
    // logs at most `{ key, error }`), but a future change that logs the whole config, or
    // folds the secret into a diagnostic payload, would leak it to whatever sink a consumer
    // wired up. This drives every derivationSecret-aware path that logs and asserts the
    // secret never surfaces in any of their arguments — including inside Error causes.
    const SENTINEL_A = "SENTINEL-derivationSecret-A-must-never-appear-in-a-log-0123456789";
    const SENTINEL_B = "SENTINEL-derivationSecret-B-must-never-appear-in-a-log-abcdefabcd";

    // 1. Unscoped wrong-secret self-heal → warn path (`transport key pair entry failed to unwrap`).
    const unscopedStorage = new MemoryStorage();
    const unscopedGen = makeGenerator();
    const creatorLog = makeLogger();
    await new TransportKeyPairVault({
      generator: unscopedGen,
      storage: unscopedStorage,
      ttl: TTL_SECONDS,
      logger: creatorLog,
      derivationSecret: holder(SENTINEL_A),
    }).getOrCreate(USER);
    const wrongSecretLog = makeLogger();
    await new TransportKeyPairVault({
      generator: unscopedGen,
      storage: unscopedStorage,
      ttl: TTL_SECONDS,
      logger: wrongSecretLog,
      derivationSecret: holder(SENTINEL_B),
    }).readStored(USER);
    expect(wrongSecretLog.warn).toHaveBeenCalled();

    // 2. Scoped wrong-secret → error path that also throws (`scope "..." failed to unwrap`).
    const scopedStorage = new MemoryStorage();
    const scopedGen = makeGenerator();
    const scopedCreatorLog = makeLogger();
    await new TransportKeyPairVault({
      generator: scopedGen,
      storage: scopedStorage,
      ttl: TTL_SECONDS,
      logger: scopedCreatorLog,
      scope: "tenant-1",
      derivationSecret: holder(SENTINEL_A),
    }).getOrCreate(USER);
    const scopedMisconfigLog = makeLogger();
    await new TransportKeyPairVault({
      generator: scopedGen,
      storage: scopedStorage,
      ttl: TTL_SECONDS,
      logger: scopedMisconfigLog,
      scope: "tenant-1",
      derivationSecret: holder(SENTINEL_B),
    })
      .getOrCreate(OTHER)
      .catch(() => {});
    expect(scopedMisconfigLog.error).toHaveBeenCalled();

    // 3. Non-authentication unwrap failure → the unexpected-error path (logs `{ key, error }`).
    const cryptoFailStorage = new MemoryStorage();
    const cryptoFailLog = makeLogger();
    const cryptoFailVault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage: cryptoFailStorage,
      ttl: TTL_SECONDS,
      logger: cryptoFailLog,
      derivationSecret: holder(SENTINEL_A),
    });
    await cryptoFailVault.getOrCreate(USER);
    const decryptSpy = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));
    await cryptoFailVault.readStored(USER).catch(() => {});
    decryptSpy.mockRestore();
    expect(cryptoFailLog.error).toHaveBeenCalled();

    // 4. Wrap-time failure → the wrap-error path (logs `{ key, error }`).
    const wrapFailLog = makeLogger();
    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));
    await new TransportKeyPairVault({
      generator: makeGenerator(),
      storage: new MemoryStorage(),
      ttl: TTL_SECONDS,
      logger: wrapFailLog,
      derivationSecret: holder(SENTINEL_A),
    })
      .getOrCreate(USER)
      .catch(() => {});
    encryptSpy.mockRestore();
    expect(wrapFailLog.error).toHaveBeenCalled();

    const logged = allLoggedText([
      creatorLog,
      wrongSecretLog,
      scopedCreatorLog,
      scopedMisconfigLog,
      cryptoFailLog,
      wrapFailLog,
    ]);
    expect(logged).not.toContain(SENTINEL_A);
    expect(logged).not.toContain(SENTINEL_B);
  });

  test("imports the HKDF base key once for the whole vault lifetime, still deriving per operation", async () => {
    const storage = new MemoryStorage();
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(SECRET_A),
    });

    const importSpy = vi.spyOn(crypto.subtle, "importKey");
    const deriveSpy = vi.spyOn(crypto.subtle, "deriveKey");

    const created = await vault.getOrCreate(USER);
    expect(await vault.readStored(USER)).toEqual(created);
    expect(await vault.readStored(USER)).toEqual(created);

    expect(importSpy).toHaveBeenCalledOnce();
    expect(deriveSpy).toHaveBeenCalledTimes(3);

    importSpy.mockRestore();
    deriveSpy.mockRestore();
  });

  test("the SDK's own Uint8Array secret is zeroized after the first wrap, and later operations still succeed", async () => {
    const storage = new MemoryStorage();
    const sdkOwnedCopy = new Uint8Array(32).fill(7);
    const vault = new TransportKeyPairVault({
      generator: makeGenerator(),
      storage,
      ttl: TTL_SECONDS,
      logger: makeLogger(),
      derivationSecret: holder(sdkOwnedCopy),
    });

    const created = await vault.getOrCreate(USER);
    expect(Array.from(sdkOwnedCopy).every((byte) => byte === 0)).toBe(true);

    expect(await vault.readStored(USER)).toEqual(created);
    const forOther = await vault.getOrCreate(OTHER);
    expect(await vault.readStored(OTHER)).toEqual(forOther);
  });
});
