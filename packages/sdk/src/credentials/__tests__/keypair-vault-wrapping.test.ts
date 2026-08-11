import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { describe, expect, test, vi } from "../../test-fixtures";
import { KeyWrappingError } from "../../errors/credential";
import { MemoryStorage } from "../../storage/memory-storage";
import type { GenericStorage } from "../../types";
import { WRAPPING_SCHEME_V1 } from "../keypair-wrapping";
import { transportKeyPairScopeStorageKey, transportKeyPairStorageKey } from "../storage-keys";
import {
  makeGatedGenerator,
  makeGenerator,
  makeLogger,
  makeVault,
  type MockLogger,
  OTHER,
  PRIVATE_KEY,
  PUBLIC_KEY,
  TTL_SECONDS,
  USER,
} from "./keypair-vault-fixtures";

const SECRET_A = "correct-horse-battery-staple";
const SECRET_B = "a-different-secret";

/** A 2-byte iv, well short of the 12 bytes AES-GCM requires. */
const TRUNCATED_IV = "0xaabb";

// A version no real scheme will ever claim, so adding codecs never breaks these tests.
const UNKNOWN_WRAPPING_VERSION = 9999;

type StoredEntry = Record<string, unknown>;

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

/** Stub every read so the vault sees the persisted entry with `patch` applied. */
function patchStoredReads(
  storage: GenericStorage,
  patch: (raw: StoredEntry) => StoredEntry,
): { restore: () => void } {
  const realGet = storage.get.bind(storage);
  vi.spyOn(storage, "get").mockImplementation(async (key: string) =>
    patch((await realGet(key)) as StoredEntry),
  );
  return {
    restore: () => {
      vi.mocked(storage.get).mockImplementation(realGet);
    },
  };
}

/** Same as `patchStoredReads`, but only for the vault's next read. */
function patchNextStoredRead(
  storage: GenericStorage,
  patch: (raw: StoredEntry) => StoredEntry,
): void {
  const realGet = storage.get.bind(storage);
  vi.spyOn(storage, "get").mockImplementationOnce(async (key: string) =>
    patch((await realGet(key)) as StoredEntry),
  );
}

describe("TransportKeyPairVault derivationSecret (opt-in at-rest wrapping)", () => {
  test("round-trips through storage: a second vault instance reads and unwraps it", async () => {
    const storage = new MemoryStorage();
    const vaultA = makeVault({ storage, secret: SECRET_A });
    const vaultB = makeVault({ storage, secret: SECRET_A });

    const created = await vaultA.getOrCreate(USER);
    expect(await vaultB.readStored(USER)).toEqual(created);
  });

  test("regression guard: no wrapping when derivationSecret is absent — persisted value stays a plain privateKey", async () => {
    const storage = new MemoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const vault = makeVault({ storage });

    await vault.getOrCreate(USER);

    expect(setSpy).toHaveBeenCalledOnce();
    const persisted = setSpy.mock.calls[0]![1] as StoredEntry;
    expect(persisted.privateKey).toBe(PRIVATE_KEY);
    expect(persisted.wrappedPrivateKey).toBeUndefined();
    expect(persisted.iv).toBeUndefined();
  });

  test("when configured, the persisted value never contains the plaintext private key", async () => {
    const storage = new MemoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const vault = makeVault({ storage, secret: SECRET_A });

    await vault.getOrCreate(USER);

    expect(setSpy).toHaveBeenCalledOnce();
    const persisted = setSpy.mock.calls[0]![1] as StoredEntry;
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
    const vaultA = makeVault({ storage, generator, secret: SECRET_A });
    const vaultB = makeVault({ storage, generator, secret: SECRET_B });

    const created = await vaultA.getOrCreate(USER);
    await expect(vaultB.readStored(USER)).resolves.toBeNull();

    const regenerated = await vaultB.getOrCreate(USER);
    expect(regenerated).not.toEqual(created);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  test("a pre-existing plaintext entry is a cache miss once derivationSecret is turned on — regenerates wrapped", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const unwrapped = makeVault({ storage, generator });
    const wrapped = makeVault({ storage, generator, secret: SECRET_A });

    const plaintextEntry = await unwrapped.getOrCreate(USER);
    expect(await wrapped.readStored(USER)).toBeNull();

    const regenerated = await wrapped.getOrCreate(USER);
    expect(regenerated).not.toEqual(plaintextEntry);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  test("a pre-existing wrapped entry read with derivationSecret turned off fails loudly instead of regenerating plaintext", async () => {
    const storage = new MemoryStorage();
    const wrapped = makeVault({ storage, secret: SECRET_A });
    const unwrappedLogger = makeLogger();
    const unwrapped = makeVault({ storage, logger: unwrappedLogger });

    const created = await wrapped.getOrCreate(USER);
    const persisted = await storage.get(transportKeyPairStorageKey(USER));

    await expect(unwrapped.readStored(USER)).rejects.toThrow(KeyWrappingError);
    // Regenerating would drop at-rest wrapping for this signer with no signal, so the
    // diagnostic hands the operator the deliberate-downgrade route instead.
    await expect(unwrapped.getOrCreate(USER)).rejects.toThrow(/permits\.clear\(\)/);
    expect(unwrappedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("no transportKeyPairDerivationSecret configured"),
      expect.objectContaining({ key: expect.any(String) }),
    );
    // The entry survives, so restoring the secret restores access to the same key pair.
    expect(await storage.get(transportKeyPairStorageKey(USER))).toEqual(persisted);
    expect(await wrapped.readStored(USER)).toEqual(created);
  });

  test("regenerates a wrapped entry after the TTL elapses", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const storage = new MemoryStorage();
      const vault = makeVault({ storage, secret: SECRET_A });

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
    const vault = makeVault({ storage, logger, secret: SECRET_A });

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
    expect(await vault.readStored(USER)).toEqual(forUser);
  });

  test("composes with scope: two different signers, same scope and secret, derive the same wrapping key", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const scopedAndWrapped = () =>
      makeVault({ storage, generator, scope: "tenant-1", secret: SECRET_A });

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
    const { generator, release } = makeGatedGenerator();
    const vault = makeVault({ storage, generator, scope: "tenant-1", secret: SECRET_A });

    const inFlight = vault.getOrCreate(USER);
    await vault.clearScope();

    release();
    await inFlight;

    expect(await storage.get(transportKeyPairScopeStorageKey("tenant-1"))).toBeNull();
    expect(await vault.readStored(USER)).toBeNull();
  });

  test("round-trips tkmsVersion through a wrapped entry, where it also participates in the AAD", async () => {
    const storage = new MemoryStorage();
    const wrappedVault = () =>
      makeVault({
        storage,
        generator: async () => ({
          publicKey: PUBLIC_KEY as unknown as SerializeTransportKeyPairReturnType["publicKey"],
          privateKey: PRIVATE_KEY as unknown as SerializeTransportKeyPairReturnType["privateKey"],
          tkmsVersion: "v1",
        }),
        secret: SECRET_A,
      });

    const created = await wrappedVault().getOrCreate(USER);
    expect(created.tkmsVersion).toBe("v1");

    // A second instance decrypting successfully proves it reconstructed the exact AAD,
    // tkmsVersion included: a dropped or altered field would fail authentication.
    expect(await wrappedVault().readStored(USER)).toEqual(created);

    const persisted = (await storage.get(transportKeyPairStorageKey(USER))) as StoredEntry;
    expect(persisted.tkmsVersion).toBe("v1");
    expect(persisted.wrappedPrivateKey).toBeDefined();
    expect(persisted.privateKey).toBeUndefined();
  });

  test("stores no tkmsVersion in a wrapped entry when the generator omits it", async () => {
    const storage = new MemoryStorage();
    const vault = makeVault({ storage, secret: SECRET_A });

    const created = await vault.getOrCreate(USER);
    expect(created.tkmsVersion).toBeUndefined();
    expect(await storage.get(transportKeyPairStorageKey(USER))).not.toHaveProperty("tkmsVersion");
    expect(await vault.readStored(USER)).not.toHaveProperty("tkmsVersion");
  });

  test("logs the unwrap-failure reason directly, unconditionally (not just when storage.delete() itself fails)", async () => {
    const storage = new MemoryStorage();
    const generator = makeGenerator();
    const vaultA = makeVault({ storage, generator, secret: SECRET_A });
    const loggerB = makeLogger();
    const vaultB = makeVault({ storage, generator, logger: loggerB, secret: SECRET_B });

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
    const correctlyConfigured = makeVault({
      storage,
      generator,
      scope: "tenant-1",
      secret: SECRET_A,
    });
    const misconfiguredLogger = makeLogger();
    const misconfigured = makeVault({
      storage,
      generator,
      logger: misconfiguredLogger,
      scope: "tenant-1",
      secret: SECRET_B,
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
    const vaultA = makeVault({ storage, generator, secret: SECRET_A });
    const vaultB = makeVault({ storage, generator, secret: SECRET_B });

    await vaultA.getOrCreate(USER);
    const regenerated = await vaultB.getOrCreate(USER);

    expect(regenerated).toBeDefined();
    await expect(vaultB.readStored(USER)).resolves.toEqual(regenerated);
  });

  test("a non-authentication unwrap failure (e.g. crypto.subtle malfunctioning) propagates instead of being treated as a cache miss", async () => {
    const logger = makeLogger();
    const vault = makeVault({ logger, secret: SECRET_A });
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
    const vault = makeVault({ storage, secret: SECRET_A });

    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));

    const error: unknown = await vault.getOrCreate(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(setSpy).not.toHaveBeenCalled();

    encryptSpy.mockRestore();
  });

  test("schema rejects a structurally invalid wrapped entry pre-decrypt, avoiding the ambiguous OperationError path", async () => {
    // A truncated/corrupted iv can't possibly be a real 12-byte AES-GCM nonce, so it is
    // caught before it ever reaches crypto.subtle.decrypt, where it would otherwise fail
    // with the exact same generic OperationError a genuine wrong-derivationSecret case
    // produces.
    const storage = new MemoryStorage();
    const vault = makeVault({ storage, secret: SECRET_A });
    const created = await vault.getOrCreate(USER);
    patchNextStoredRead(storage, (raw) => ({ ...raw, iv: TRUNCATED_IV }));

    const decryptSpy = vi.spyOn(crypto.subtle, "decrypt");
    const regenerated = await vault.getOrCreate(USER);
    expect(decryptSpy).not.toHaveBeenCalled();
    expect(regenerated).not.toEqual(created);
    decryptSpy.mockRestore();
  });

  test("a scoped entry that is structurally corrupted (fails schema validation) is never clobbered either — fails loudly like the OperationError case", async () => {
    // A truncated iv fails schema validation before decrypt is ever attempted. For a
    // *scoped* vault, that structural-failure path must be just as strict as the
    // OperationError path: silently discarding and regenerating here would clobber the
    // scope's shared entry via a different code path.
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = makeVault({ storage, logger, scope: "tenant-1", secret: SECRET_A });
    await vault.getOrCreate(USER);
    patchStoredReads(storage, (raw) => ({ ...raw, iv: TRUNCATED_IV }));

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
    expect(deleteSpy).not.toHaveBeenCalled();
    await expect(vault.readStored(USER)).rejects.toThrow(/scope "tenant-1"/);
  });

  test("a scoped entry with a corrupted ciphertext is never clobbered either", async () => {
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = makeVault({ storage, logger, scope: "tenant-1", secret: SECRET_A });
    await vault.getOrCreate(USER);
    // Truncated below the AES-GCM authentication tag: structurally impossible ciphertext.
    patchStoredReads(storage, (raw) => ({ ...raw, wrappedPrivateKey: `0x${"cc".repeat(8)}` }));

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
    const wrapped = makeVault({ storage, scope: "tenant-1", secret: SECRET_A });
    const unwrapped = makeVault({ storage, logger, scope: "tenant-1" });

    await wrapped.getOrCreate(USER);
    patchStoredReads(storage, (raw) => ({ ...raw, iv: TRUNCATED_IV }));

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
    const vault = makeVault({ storage, generator, secret: SECRET_A });

    await vault.getOrCreate(USER);
    const rawBefore = await storage.get(transportKeyPairStorageKey(USER));
    const patched = patchStoredReads(storage, (raw) => ({
      ...raw,
      wrappingVersion: UNKNOWN_WRAPPING_VERSION,
    }));

    const error: unknown = await vault.getOrCreate(USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeyWrappingError);
    expect(error).toMatchObject({
      message: expect.stringContaining(`wrappingVersion ${UNKNOWN_WRAPPING_VERSION}`),
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();

    patched.restore();
    expect(await storage.get(transportKeyPairStorageKey(USER))).toEqual(rawBefore);
  });

  test("a scoped entry written under an unrecognized wrappingVersion is preserved and names the scope", async () => {
    const storage = new MemoryStorage();
    const deleteSpy = vi.spyOn(storage, "delete");
    const logger = makeLogger();
    const vault = makeVault({ storage, logger, scope: "tenant-1", secret: SECRET_A });
    await vault.getOrCreate(USER);
    patchStoredReads(storage, (raw) => ({ ...raw, wrappingVersion: UNKNOWN_WRAPPING_VERSION }));

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
    const vault = makeVault({ storage, scope: "tenant-1", secret: SECRET_A });
    await vault.getOrCreate(USER);
    patchStoredReads(storage, ({ wrappingVersion: _dropped, ...raw }) => raw);

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
    const unwrapped = makeVault({ storage, generator, scope: "tenant-1" });
    const wrappedLogger = makeLogger();
    const wrapped = makeVault({
      storage,
      generator,
      logger: wrappedLogger,
      scope: "tenant-1",
      secret: SECRET_A,
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
    const wrapped = makeVault({ storage, generator, scope: "tenant-1", secret: SECRET_A });
    const unwrappedLogger = makeLogger();
    const unwrapped = makeVault({ storage, generator, logger: unwrappedLogger, scope: "tenant-1" });

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
    const vault = makeVault({ storage, logger, scope: "tenant-1" });
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
    const perSigner = makeVault({ storage, secret: SECRET_A });
    const scopedAsAddress = makeVault({ storage, scope: USER, secret: SECRET_A });

    await perSigner.getOrCreate(USER);
    const signerEntry = await storage.get(transportKeyPairStorageKey(USER));
    await storage.set(transportKeyPairScopeStorageKey(USER), signerEntry);

    await expect(scopedAsAddress.readStored(USER)).rejects.toThrow(KeyWrappingError);
  });

  test("never leaks the derivationSecret value into any log line, on any path (leak regression)", async () => {
    // Exercises every derivationSecret-aware logging path and asserts the secret never
    // surfaces in any logged argument, including inside Error causes.
    const SENTINEL_A = "SENTINEL-derivationSecret-A-must-never-appear-in-a-log-0123456789";
    const SENTINEL_B = "SENTINEL-derivationSecret-B-must-never-appear-in-a-log-abcdefabcd";

    // Unscoped wrong-secret self-heal → warn path.
    const unscopedStorage = new MemoryStorage();
    const unscopedGen = makeGenerator();
    const creatorLog = makeLogger();
    await makeVault({
      storage: unscopedStorage,
      generator: unscopedGen,
      logger: creatorLog,
      secret: SENTINEL_A,
    }).getOrCreate(USER);
    const wrongSecretLog = makeLogger();
    await makeVault({
      storage: unscopedStorage,
      generator: unscopedGen,
      logger: wrongSecretLog,
      secret: SENTINEL_B,
    }).readStored(USER);
    expect(wrongSecretLog.warn).toHaveBeenCalled();

    // Scoped wrong-secret → error path that also throws.
    const scopedStorage = new MemoryStorage();
    const scopedGen = makeGenerator();
    const scopedCreatorLog = makeLogger();
    await makeVault({
      storage: scopedStorage,
      generator: scopedGen,
      logger: scopedCreatorLog,
      scope: "tenant-1",
      secret: SENTINEL_A,
    }).getOrCreate(USER);
    const scopedMisconfigLog = makeLogger();
    await makeVault({
      storage: scopedStorage,
      generator: scopedGen,
      logger: scopedMisconfigLog,
      scope: "tenant-1",
      secret: SENTINEL_B,
    })
      .getOrCreate(OTHER)
      .catch(() => {});
    expect(scopedMisconfigLog.error).toHaveBeenCalled();

    // Non-authentication unwrap failure → the unexpected-error path.
    const cryptoFailLog = makeLogger();
    const cryptoFailVault = makeVault({ logger: cryptoFailLog, secret: SENTINEL_A });
    await cryptoFailVault.getOrCreate(USER);
    const decryptSpy = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));
    await cryptoFailVault.readStored(USER).catch(() => {});
    decryptSpy.mockRestore();
    expect(cryptoFailLog.error).toHaveBeenCalled();

    // Wrap-time failure → the wrap-error path.
    const wrapFailLog = makeLogger();
    const encryptSpy = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new TypeError("crypto.subtle is unavailable in this environment"));
    await makeVault({ logger: wrapFailLog, secret: SENTINEL_A })
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
    const vault = makeVault({ secret: SECRET_A });

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
    const sdkOwnedCopy = new Uint8Array(32).fill(7);
    const vault = makeVault({ secret: sdkOwnedCopy });

    const created = await vault.getOrCreate(USER);
    expect(Array.from(sdkOwnedCopy).every((byte) => byte === 0)).toBe(true);

    expect(await vault.readStored(USER)).toEqual(created);
    const forOther = await vault.getOrCreate(OTHER);
    expect(await vault.readStored(OTHER)).toEqual(forOther);
  });
});
