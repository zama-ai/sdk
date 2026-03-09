import { toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { HANDLE_VERSION } from "../constants";
import { fheTypeIdFromName, FheTypeNameToIdMap } from "../fhe-type";
import { computeInputHandle, computeMockCiphertext } from "../handle";
import { hardhatCleartextConfig } from "../presets";

describe("handle", () => {
  it("computeInputHandle matches precomputed test vector for index 0", () => {
    const random32 = toBytes(("0x" + "11".repeat(32)) as `0x${string}`);
    const mockCiphertext = computeMockCiphertext(fheTypeIdFromName("euint8"), 42n, random32);
    const expectedCiphertext = "0x1668ad37a597863340858d59a40264ceed77d79ff8001c02d8768c2a6f098da6";

    const handleHex = computeInputHandle(
      mockCiphertext,
      0,
      fheTypeIdFromName("euint8"),
      hardhatCleartextConfig.aclContractAddress,
      BigInt(hardhatCleartextConfig.chainId),
    );
    const expectedHandle = "0x9067cd93773315815e07e738be1bd5c043044a8fc1000000000000007a690200";

    expect(mockCiphertext).toBe(expectedCiphertext);
    expect(handleHex).toBe(expectedHandle);
  });

  it("computeInputHandle matches precomputed test vector for non-zero index", () => {
    const random32 = toBytes(("0x" + "22".repeat(32)) as `0x${string}`);
    const mockCiphertext = computeMockCiphertext(fheTypeIdFromName("euint8"), 99n, random32);
    const handleHex = computeInputHandle(
      mockCiphertext,
      5,
      fheTypeIdFromName("euint8"),
      hardhatCleartextConfig.aclContractAddress,
      31_337n,
    );
    const expectedHandle = "0xcd3bf5700ed87292362798f9ee0f28510348fa3b78050000000000007a690200";

    expect(handleHex).toBe(expectedHandle);
    const handle = BigInt(handleHex);
    expect(handle & 0xffn).toBe(BigInt(HANDLE_VERSION));
    expect((handle >> 8n) & 0xffn).toBe(BigInt(fheTypeIdFromName("euint8")));
    expect((handle >> 16n) & 0xffff_ffff_ffff_ffffn).toBe(31_337n);
    expect((handle >> 80n) & 0xffn).toBe(5n);
  });

  it("computeMockCiphertext matches a precomputed test vector", () => {
    const random32 = toBytes(("0x" + "33".repeat(32)) as `0x${string}`);
    const result = computeMockCiphertext(fheTypeIdFromName("euint16"), 0x1234n, random32);
    const expected = "0xc9e84391d90f823647ae0840c852a338860399a6a8e1d4862d64db814bd491d6";

    expect(result).toBe(expected);
  });

  it("computeMockCiphertext distinguishes bool and uint256 vectors", () => {
    const random32 = toBytes(("0x" + "44".repeat(32)) as `0x${string}`);

    const boolCiphertext = computeMockCiphertext(fheTypeIdFromName("ebool"), 1n, random32);
    const uint256Ciphertext = computeMockCiphertext(fheTypeIdFromName("euint256"), 1n, random32);
    const expectedBool = "0x22f313acf24f016a6075b20dc3c8c54082efeb8b88f6ca9ed12dd3e8c004f9b5";
    const expectedUint256 = "0xc2e9ac6f1a4bb20b8439d8fb6f3bf11c1d01e01b8fcaa4f8cdcd54e77738fe17";

    expect(boolCiphertext).toBe(expectedBool);
    expect(uint256Ciphertext).toBe(expectedUint256);
    expect(boolCiphertext).not.toBe(uint256Ciphertext);
  });

  it("computeMockCiphertext rejects random values not equal to 32 bytes", () => {
    expect(() => computeMockCiphertext(fheTypeIdFromName("euint8"), 1n, toBytes("0x1234"))).toThrow(
      /exactly 32 bytes/i,
    );
  });

  it("computeInputHandle validates index range", () => {
    const mockCiphertext = "0x1668ad37a597863340858d59a40264ceed77d79ff8001c02d8768c2a6f098da6";

    expect(() =>
      computeInputHandle(
        mockCiphertext,
        -1,
        fheTypeIdFromName("euint8"),
        hardhatCleartextConfig.aclContractAddress,
        31_337n,
      ),
    ).toThrow(/between 0 and 255/i);
    expect(() =>
      computeInputHandle(
        mockCiphertext,
        256,
        fheTypeIdFromName("euint8"),
        hardhatCleartextConfig.aclContractAddress,
        31_337n,
      ),
    ).toThrow(/between 0 and 255/i);
    expect(() =>
      computeInputHandle(
        mockCiphertext,
        1.5,
        fheTypeIdFromName("euint8"),
        hardhatCleartextConfig.aclContractAddress,
        31_337n,
      ),
    ).toThrow(/between 0 and 255/i);
  });
});
