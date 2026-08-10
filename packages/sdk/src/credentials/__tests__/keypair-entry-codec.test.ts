import { describe, expect, test } from "../../test-fixtures";
import { classifyPersistedEntry, encodeWrappedEntry } from "../keypair-entry-codec";
import { DerivationSecretHolder, WRAPPING_SCHEME_V1 } from "../keypair-wrapping";
import type { StoredTransportKeyPair } from "../types";

const IDENTITY = "signer:0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";
const SECRET = "correct-horse-battery-staple";
const holder = (secret: string) => new DerivationSecretHolder(secret);

const KEY_PAIR: StoredTransportKeyPair = {
  publicKey: `0x${"aa".repeat(32)}`,
  privateKey: `0x${"22".repeat(32)}`,
  createdAt: 1_700_000_000,
  expiresAt: 1_700_086_400,
};

const wrappedEntry = (overrides: Record<string, unknown> = {}) => ({
  wrappingVersion: WRAPPING_SCHEME_V1.version,
  publicKey: KEY_PAIR.publicKey,
  wrappedPrivateKey: `0x${"cc".repeat(16)}`,
  iv: `0x${"bb".repeat(WRAPPING_SCHEME_V1.ivLengthBytes)}`,
  createdAt: KEY_PAIR.createdAt,
  expiresAt: KEY_PAIR.expiresAt,
  ...overrides,
});

describe("classifyPersistedEntry", () => {
  test("recognizes the plaintext and wrapped shapes", () => {
    expect(classifyPersistedEntry(KEY_PAIR).kind).toBe("plaintext");
    expect(classifyPersistedEntry(wrappedEntry()).kind).toBe("wrapped");
  });

  test("reports anything that is neither shape as unrecognized", () => {
    expect(classifyPersistedEntry({ totally: "wrong shape" }).kind).toBe("unrecognized");
    expect(classifyPersistedEntry({ publicKey: KEY_PAIR.publicKey }).kind).toBe("unrecognized");
    expect(classifyPersistedEntry(null).kind).toBe("unrecognized");
    expect(classifyPersistedEntry("not an entry").kind).toBe("unrecognized");
  });

  test("reports an unreadable wrapping scheme version rather than treating the entry as junk", () => {
    // The probe is version-agnostic on purpose: an entry a future scheme wrote is still
    // someone's ciphertext, and callers must be able to tell it apart from junk.
    const unknownVersion = classifyPersistedEntry(
      wrappedEntry({ wrappingVersion: WRAPPING_SCHEME_V1.version + 1 }),
    );
    expect(unknownVersion).toMatchObject({
      kind: "unsupported-version",
      version: WRAPPING_SCHEME_V1.version + 1,
    });

    const { wrappingVersion: _dropped, ...versionless } = wrappedEntry();
    expect(classifyPersistedEntry(versionless).kind).toBe("unsupported-version");
    expect(
      classifyPersistedEntry(wrappedEntry({ wrappingVersion: String(WRAPPING_SCHEME_V1.version) }))
        .kind,
    ).toBe("unsupported-version");
  });

  test("reports a structurally invalid wrapped entry as corrupt, not unrecognized", () => {
    // 15 bytes: one below the AES-GCM authentication tag, so it can't be a real ciphertext.
    expect(
      classifyPersistedEntry(wrappedEntry({ wrappedPrivateKey: `0x${"cc".repeat(15)}` })).kind,
    ).toBe("corrupt-wrapped");
    // 33 hex digits reads as 16.5 bytes, above the floor; viem's toBytes would left-pad it
    // into a plausible ciphertext that only fails at decrypt time, where a corrupt entry is
    // indistinguishable from a wrong derivationSecret.
    expect(
      classifyPersistedEntry(wrappedEntry({ wrappedPrivateKey: `0x${"cc".repeat(16)}d` })).kind,
    ).toBe("corrupt-wrapped");
    expect(classifyPersistedEntry(wrappedEntry({ iv: "0xaabb" })).kind).toBe("corrupt-wrapped");
  });

  test("accepts a wrappedPrivateKey exactly at the AES-GCM tag length", () => {
    expect(
      classifyPersistedEntry(
        wrappedEntry({ wrappedPrivateKey: `0x${"cc".repeat(WRAPPING_SCHEME_V1.tagLengthBytes)}` }),
      ).kind,
    ).toBe("wrapped");
  });
});

describe("wrapped entry codec", () => {
  test("round-trips a key pair through the encoded shape", async () => {
    const encoded = await encodeWrappedEntry(KEY_PAIR, holder(SECRET), IDENTITY);
    expect(encoded.wrappingVersion).toBe(WRAPPING_SCHEME_V1.version);
    expect(encoded).not.toHaveProperty("privateKey");

    const classified = classifyPersistedEntry(encoded);
    if (classified.kind !== "wrapped") {
      throw new Error(`expected a wrapped entry, got ${classified.kind}`);
    }
    expect(classified.expiresAt).toBe(KEY_PAIR.expiresAt);
    await expect(classified.decode(holder(SECRET), IDENTITY)).resolves.toEqual(KEY_PAIR);
  });

  test("carries tkmsVersion through the encoded shape, and omits it when absent", async () => {
    const tagged = { ...KEY_PAIR, tkmsVersion: "v1" };
    const encoded = await encodeWrappedEntry(tagged, holder(SECRET), IDENTITY);
    expect(encoded.tkmsVersion).toBe("v1");

    const classified = classifyPersistedEntry(encoded);
    if (classified.kind !== "wrapped") {
      throw new Error(`expected a wrapped entry, got ${classified.kind}`);
    }
    await expect(classified.decode(holder(SECRET), IDENTITY)).resolves.toEqual(tagged);

    expect(await encodeWrappedEntry(KEY_PAIR, holder(SECRET), IDENTITY)).not.toHaveProperty(
      "tkmsVersion",
    );
  });
});
