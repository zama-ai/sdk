import { describe, expect, test } from "../../test-fixtures";
import { WRAPPING_VERSION } from "../keypair-wrapping";
import { WrappedPrivateKeyEntrySchema } from "../schemas";

const entry = (wrappedPrivateKey: string) => ({
  wrappingVersion: WRAPPING_VERSION,
  publicKey: `0x${"aa".repeat(32)}`,
  wrappedPrivateKey,
  iv: `0x${"bb".repeat(12)}`,
  createdAt: 1_700_000_000,
  expiresAt: 1_700_086_400,
});

describe("WrappedPrivateKeyEntrySchema", () => {
  test("rejects a wrappedPrivateKey one byte below the AES-GCM tag length (15 bytes)", () => {
    expect(WrappedPrivateKeyEntrySchema.safeParse(entry(`0x${"cc".repeat(15)}`)).success).toBe(
      false,
    );
  });

  test("accepts a wrappedPrivateKey exactly at the AES-GCM tag length (16 bytes)", () => {
    expect(WrappedPrivateKeyEntrySchema.safeParse(entry(`0x${"cc".repeat(16)}`)).success).toBe(
      true,
    );
  });

  test("rejects an odd-length wrappedPrivateKey that would otherwise clear the length floor", () => {
    // 33 hex digits reads as 16.5 bytes, above the 16-byte floor; viem's toBytes would
    // left-pad it into a plausible ciphertext that only fails at decrypt time, where a
    // corrupt entry is indistinguishable from a wrong derivationSecret.
    expect(WrappedPrivateKeyEntrySchema.safeParse(entry(`0x${"cc".repeat(16)}d`)).success).toBe(
      false,
    );
  });

  test("rejects an entry with a missing or unknown wrappingVersion", () => {
    const valid = entry(`0x${"cc".repeat(16)}`);
    const { wrappingVersion: _dropped, ...versionless } = valid;

    expect(WrappedPrivateKeyEntrySchema.safeParse(versionless).success).toBe(false);
    expect(
      WrappedPrivateKeyEntrySchema.safeParse({ ...valid, wrappingVersion: WRAPPING_VERSION + 1 })
        .success,
    ).toBe(false);
    expect(
      WrappedPrivateKeyEntrySchema.safeParse({
        ...valid,
        wrappingVersion: String(WRAPPING_VERSION),
      }).success,
    ).toBe(false);
  });
});
