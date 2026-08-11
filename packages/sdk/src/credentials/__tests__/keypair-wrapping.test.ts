import { describe, test, expect, vi } from "../../test-fixtures";
import {
  DerivationSecretHolder,
  isUnwrapAuthFailure,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "../keypair-wrapping";
import type { WrappedPrivateKeyMetadata } from "../keypair-wrapping";

const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const SECRET_A = "correct-horse-battery-staple";
const SECRET_B = "a-different-secret";
const holder = (secret: string | Uint8Array) => new DerivationSecretHolder(secret);
const IDENTITY_A = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B";
const IDENTITY_B = "tenant-1";
const METADATA: WrappedPrivateKeyMetadata = {
  publicKey: `0x${"aa".repeat(32)}`,
  createdAt: 1_700_000_000,
  expiresAt: 1_700_086_400,
};

describe("keypair-wrapping", () => {
  test("round-trips: wrap then unwrap recovers the original private key", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const unwrapped = await unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, METADATA);
    expect(unwrapped).toBe(PRIVATE_KEY);
  });

  test("accepts a Uint8Array secret, not just a string", async () => {
    const secretHolder = holder(new TextEncoder().encode(SECRET_A));
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, secretHolder, IDENTITY_A, METADATA);
    const unwrapped = await unwrapPrivateKey(wrapped, secretHolder, IDENTITY_A, METADATA);
    expect(unwrapped).toBe(PRIVATE_KEY);
  });

  test("a string secret and the equivalent UTF-8 Uint8Array derive the same key", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const unwrapped = await unwrapPrivateKey(
      wrapped,
      holder(new TextEncoder().encode(SECRET_A)),
      IDENTITY_A,
      METADATA,
    );
    expect(unwrapped).toBe(PRIVATE_KEY);
  });

  test("generates a fresh random IV on every call — two wraps of the same key never collide", async () => {
    const first = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const second = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    expect(first.iv).not.toBe(second.iv);
    expect(first.wrappedPrivateKey).not.toBe(second.wrappedPrivateKey);
  });

  test("unwrapping with the wrong secret rejects (AES-GCM auth failure), doesn't return garbage", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const error = await unwrapPrivateKey(wrapped, holder(SECRET_B), IDENTITY_A, METADATA).catch(
      (e: unknown) => e,
    );
    expect(error).toBeDefined();
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("unwrapping with the wrong identity (different salt) rejects", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    await expect(
      unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_B, METADATA),
    ).rejects.toThrow();
  });

  test("a tampered ciphertext rejects instead of decrypting to different plaintext", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const tampered = {
      ...wrapped,
      wrappedPrivateKey: (wrapped.wrappedPrivateKey.slice(0, -2) +
        (wrapped.wrappedPrivateKey.endsWith("ff")
          ? "ee"
          : "ff")) as typeof wrapped.wrappedPrivateKey,
    };
    await expect(
      unwrapPrivateKey(tampered, holder(SECRET_A), IDENTITY_A, METADATA),
    ).rejects.toThrow();
  });

  test("tampering with a sibling metadata field (publicKey) rejects, same as ciphertext tampering", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const tamperedMetadata: WrappedPrivateKeyMetadata = {
      ...METADATA,
      publicKey: `0x${"bb".repeat(32)}`,
    };
    const error = await unwrapPrivateKey(
      wrapped,
      holder(SECRET_A),
      IDENTITY_A,
      tamperedMetadata,
    ).catch((e: unknown) => e);
    expect(error).toBeDefined();
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("tampering with a sibling metadata field (expiresAt) rejects — TTL can't be silently extended", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const tamperedMetadata: WrappedPrivateKeyMetadata = {
      ...METADATA,
      expiresAt: METADATA.expiresAt + 1_000_000,
    };
    await expect(
      unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, tamperedMetadata),
    ).rejects.toThrow();
  });

  test("tampering with a sibling metadata field (createdAt) rejects", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const error = await unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, {
      ...METADATA,
      createdAt: METADATA.createdAt - 1,
    }).catch((e: unknown) => e);
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("dropping tkmsVersion at unwrap time rejects — absent is not interchangeable with any value", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, {
      ...METADATA,
      tkmsVersion: "v1",
    });
    const error = await unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, METADATA).catch(
      (e: unknown) => e,
    );
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("adding a tkmsVersion at unwrap time to an entry wrapped without one rejects", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, METADATA);
    const error = await unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, {
      ...METADATA,
      tkmsVersion: "v1",
    }).catch((e: unknown) => e);
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("swapping tkmsVersion for a different value rejects — a KMS rotation can't be forged onto an old entry", async () => {
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, holder(SECRET_A), IDENTITY_A, {
      ...METADATA,
      tkmsVersion: "v1",
    });
    const error = await unwrapPrivateKey(wrapped, holder(SECRET_A), IDENTITY_A, {
      ...METADATA,
      tkmsVersion: "v2",
    }).catch((e: unknown) => e);
    expect(isUnwrapAuthFailure(error)).toBe(true);
  });

  test("same secret, same identity, two different signers' calls derive the same wrapping key", async () => {
    // Two signers sharing a transportKeyPairScope (same `identity`) and the same
    // derivationSecret must be able to wrap/unwrap each other's persisted entry.
    const wrappedBySignerA = await wrapPrivateKey(
      PRIVATE_KEY,
      holder(SECRET_A),
      IDENTITY_B,
      METADATA,
    );
    const unwrappedBySignerB = await unwrapPrivateKey(
      wrappedBySignerA,
      holder(SECRET_A),
      IDENTITY_B,
      METADATA,
    );
    expect(unwrappedBySignerB).toBe(PRIVATE_KEY);
  });

  test("isUnwrapAuthFailure() is false for an unrelated error", () => {
    expect(isUnwrapAuthFailure(new TypeError("crypto.subtle is not available"))).toBe(false);
    expect(isUnwrapAuthFailure("not an error")).toBe(false);
  });

  test("unwraps an entry wrapped before the shared-base-key refactor: key derivation is unchanged", async () => {
    // Ciphertext frozen from a shipped build, wrapped under SECRET_A / IDENTITY_A /
    // METADATA: it must stay decryptable or entries already in storage become unreadable.
    const legacyEntry = {
      wrappedPrivateKey:
        "0xea6b82c6d4dc931a0f995528aa29a7321478642b3ff6cfc82e68b3da01b2111a48d6729b0b3e9099d89f8e750bc3c411",
      iv: "0xe3fff060008af240bf5ecce7",
    } as const;

    await expect(
      unwrapPrivateKey(legacyEntry, holder(SECRET_A), IDENTITY_A, METADATA),
    ).resolves.toBe(PRIVATE_KEY);
  });
});

describe("DerivationSecretHolder", () => {
  test("imports the HKDF base key once across many wrap/unwrap operations, deriving per operation", async () => {
    const importSpy = vi.spyOn(crypto.subtle, "importKey");
    const deriveSpy = vi.spyOn(crypto.subtle, "deriveKey");
    const secretHolder = holder(SECRET_A);

    const first = await wrapPrivateKey(PRIVATE_KEY, secretHolder, IDENTITY_A, METADATA);
    const second = await wrapPrivateKey(PRIVATE_KEY, secretHolder, IDENTITY_A, METADATA);
    await expect(unwrapPrivateKey(first, secretHolder, IDENTITY_A, METADATA)).resolves.toBe(
      PRIVATE_KEY,
    );
    await expect(unwrapPrivateKey(second, secretHolder, IDENTITY_A, METADATA)).resolves.toBe(
      PRIVATE_KEY,
    );

    expect(importSpy).toHaveBeenCalledOnce();
    expect(deriveSpy).toHaveBeenCalledTimes(4);

    importSpy.mockRestore();
    deriveSpy.mockRestore();
  });

  test("zeroizes the Uint8Array it owns once the import succeeds, and keeps working after", async () => {
    const secretBytes = new TextEncoder().encode(SECRET_A);
    const secretHolder = holder(secretBytes);

    const wrapped = await wrapPrivateKey(PRIVATE_KEY, secretHolder, IDENTITY_A, METADATA);
    expect(Array.from(secretBytes).every((byte) => byte === 0)).toBe(true);

    await expect(unwrapPrivateKey(wrapped, secretHolder, IDENTITY_A, METADATA)).resolves.toBe(
      PRIVATE_KEY,
    );
  });

  test("a string secret keeps working after the raw reference is dropped", async () => {
    const secretHolder = holder(SECRET_A);
    const wrapped = await wrapPrivateKey(PRIVATE_KEY, secretHolder, IDENTITY_A, METADATA);
    await expect(unwrapPrivateKey(wrapped, secretHolder, IDENTITY_A, METADATA)).resolves.toBe(
      PRIVATE_KEY,
    );
    expect(JSON.stringify(secretHolder)).not.toContain(SECRET_A);
  });
});
