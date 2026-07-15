import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { KeyDigestMismatchError, KeyDigestVerificationFailedError } from "../../errors/key-digest";
import { verifyFheEncryptionKeyDigest } from "../verify-key-digest";

const KMS_GENERATION_ADDRESS = "0x0000000000000000000000000000000000000042" as Address;

// Golden vectors cross-checked against an independent implementation
// (Python's hashlib.shake_256), not just against @noble/hashes itself:
//   shake_256(b"PDAT_KEY" + b"hello-fhe-public-key").hexdigest(32)
//   shake_256(b"PDAT_CRS" + b"hello-crs-bytes").hexdigest(32)
const KEY_BYTES = new TextEncoder().encode("hello-fhe-public-key");
const KEY_DIGEST_HEX = "0xa5f12aae16d4098297420cff94f00e2d4203c39e78739e7134152a073a5ccaba";
const CRS_BYTES = new TextEncoder().encode("hello-crs-bytes");
const CRS_DIGEST_HEX = "0xa034706a83ae4dd66a9b2bcc1458c32092c103005ab16d13c4b1e4ddbb7c632e";

function createMockPublicClient(overrides: {
  keyMaterials?: readonly [readonly string[], { keyType: number; digest: `0x${string}` }[]];
  crsMaterials?: readonly [readonly string[], `0x${string}`];
  onCall?: (functionName: string) => void;
}) {
  const keyMaterials = overrides.keyMaterials ?? [
    ["https://example.com/key"],
    [{ keyType: 1, digest: KEY_DIGEST_HEX }],
  ];
  const crsMaterials = overrides.crsMaterials ?? [["https://example.com/crs"], CRS_DIGEST_HEX];

  return {
    readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
      overrides.onCall?.(functionName);
      if (functionName === "getKeyMaterials") {
        return Promise.resolve(keyMaterials);
      }
      return Promise.resolve(crsMaterials);
    }),
  };
}

function keyBytes(overrides: { keyId?: string; crsId?: string } = {}) {
  return {
    publicKeyBytes: { id: overrides.keyId ?? "1", bytes: KEY_BYTES },
    crsBytes: { id: overrides.crsId ?? "2", bytes: CRS_BYTES },
  };
}

describe("verifyFheEncryptionKeyDigest", () => {
  test("resolves when both digests match", async () => {
    const publicClient = createMockPublicClient({});
    await expect(
      verifyFheEncryptionKeyDigest(publicClient as any, KMS_GENERATION_ADDRESS, keyBytes()),
    ).resolves.toBeUndefined();
  });

  test("throws KeyDigestMismatchError when the public key digest doesn't match", async () => {
    const publicClient = createMockPublicClient({
      keyMaterials: [["https://example.com/key"], [{ keyType: 1, digest: `0x${"00".repeat(32)}` }]],
    });
    await expect(
      verifyFheEncryptionKeyDigest(publicClient as any, KMS_GENERATION_ADDRESS, keyBytes()),
    ).rejects.toThrow(KeyDigestMismatchError);
  });

  test("throws KeyDigestMismatchError when the CRS digest doesn't match", async () => {
    const publicClient = createMockPublicClient({
      crsMaterials: [["https://example.com/crs"], `0x${"00".repeat(32)}`],
    });
    await expect(
      verifyFheEncryptionKeyDigest(publicClient as any, KMS_GENERATION_ADDRESS, keyBytes()),
    ).rejects.toThrow(KeyDigestMismatchError);
  });

  test("throws KeyDigestVerificationFailedError when no Public key digest is recorded", async () => {
    const publicClient = createMockPublicClient({
      keyMaterials: [["https://example.com/key"], [{ keyType: 0, digest: KEY_DIGEST_HEX }]],
    });
    await expect(
      verifyFheEncryptionKeyDigest(publicClient as any, KMS_GENERATION_ADDRESS, keyBytes()),
    ).rejects.toThrow(KeyDigestVerificationFailedError);
  });

  test("throws KeyDigestVerificationFailedError when the on-chain read fails", async () => {
    const publicClient = { readContract: vi.fn().mockRejectedValue(new Error("RPC timeout")) };
    await expect(
      verifyFheEncryptionKeyDigest(publicClient as any, KMS_GENERATION_ADDRESS, keyBytes()),
    ).rejects.toThrow(KeyDigestVerificationFailedError);
  });

  test("throws KeyDigestVerificationFailedError when dataId isn't a valid on-chain id", async () => {
    const publicClient = createMockPublicClient({});
    await expect(
      verifyFheEncryptionKeyDigest(
        publicClient as any,
        KMS_GENERATION_ADDRESS,
        keyBytes({ keyId: "not-a-number" }),
      ),
    ).rejects.toThrow(KeyDigestVerificationFailedError);
  });

  test("calls getKeyMaterials/getCrsMaterials with the parsed dataId as keyId/crsId", async () => {
    const publicClient = createMockPublicClient({});
    await verifyFheEncryptionKeyDigest(
      publicClient as any,
      KMS_GENERATION_ADDRESS,
      keyBytes({ keyId: "7", crsId: "9" }),
    );
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: KMS_GENERATION_ADDRESS,
        functionName: "getKeyMaterials",
        args: [7n],
      }),
    );
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: KMS_GENERATION_ADDRESS,
        functionName: "getCrsMaterials",
        args: [9n],
      }),
    );
  });
});
