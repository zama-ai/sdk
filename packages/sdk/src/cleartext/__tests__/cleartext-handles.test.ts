import { describe, it, expect } from "vitest";
import { computeCleartextHandles, parseHandle } from "../cleartext-handles";
import { BITS_TO_FHE_TYPE } from "../constants";

const ACL_ADDRESS = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
const CHAIN_ID = 31337;

describe("computeCleartextHandles", () => {
  it("produces handles with correct fheTypeId for each bit-width", () => {
    const bitWidths = [2, 4, 8, 16, 32, 64, 128, 160, 256];
    const values = bitWidths.map((_, i) => BigInt(i));

    const { handles } = computeCleartextHandles({
      values,
      encryptionBits: bitWidths,
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    });

    expect(handles).toHaveLength(bitWidths.length);

    for (let i = 0; i < bitWidths.length; i++) {
      const parsed = parseHandle(handles[i]!);
      expect(parsed.fheTypeId).toBe(BITS_TO_FHE_TYPE[bitWidths[i]!]);
    }
  });

  it("produces unique handles for identical inputs (entropy injection)", () => {
    const params = {
      values: [42n, 100n],
      encryptionBits: [32, 64],
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    };

    const result1 = computeCleartextHandles(params);
    const result2 = computeCleartextHandles(params);

    expect(result1.handles[0]).not.toBe(result2.handles[0]);
    expect(result1.mockCiphertexts).not.toEqual(result2.mockCiphertexts);
  });

  it("different values produce different handles", () => {
    const base = {
      encryptionBits: [32],
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    };

    const { handles: h1 } = computeCleartextHandles({ ...base, values: [1n] });
    const { handles: h2 } = computeCleartextHandles({ ...base, values: [2n] });

    expect(h1[0]).not.toBe(h2[0]);
  });

  it("assigns sequential indices (0, 1, 2)", () => {
    const { handles } = computeCleartextHandles({
      values: [10n, 20n, 30n],
      encryptionBits: [8, 16, 32],
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    });

    for (let i = 0; i < handles.length; i++) {
      const parsed = parseHandle(handles[i]!);
      expect(parsed.index).toBe(i);
    }
  });

  it("throws on length mismatch between values and encryptionBits", () => {
    expect(() =>
      computeCleartextHandles({
        values: [1n, 2n],
        encryptionBits: [32],
        aclContractAddress: ACL_ADDRESS,
        chainId: CHAIN_ID,
      }),
    ).toThrow("Length mismatch");
  });

  it("allows 255 handles (max valid index 254)", () => {
    const { handles } = computeCleartextHandles({
      values: Array.from({ length: 255 }, (_, i) => BigInt(i)),
      encryptionBits: Array(255).fill(8),
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    });
    expect(handles).toHaveLength(255);
    expect(parseHandle(handles[254]!).index).toBe(254);
  });

  it("throws when more than 255 handles requested", () => {
    expect(() =>
      computeCleartextHandles({
        values: Array.from({ length: 256 }, (_, i) => BigInt(i)),
        encryptionBits: Array(256).fill(8),
        aclContractAddress: ACL_ADDRESS,
        chainId: CHAIN_ID,
      }),
    ).toThrow("Cannot generate more than 255 handles");
  });

  it("throws on unsupported bit-width", () => {
    expect(() =>
      computeCleartextHandles({
        values: [1n],
        encryptionBits: [7],
        aclContractAddress: ACL_ADDRESS,
        chainId: CHAIN_ID,
      }),
    ).toThrow("Unsupported encryption bit-width: 7");
  });

  it("encodes multi-byte chain IDs correctly (Hoodi 560048)", () => {
    const { handles } = computeCleartextHandles({
      values: [42n],
      encryptionBits: [64],
      aclContractAddress: ACL_ADDRESS,
      chainId: 560048,
    });
    const parsed = parseHandle(handles[0]!);
    expect(parsed.chainId).toBe(BigInt(560048));
  });
});

describe("parseHandle", () => {
  it("round-trips correctly with computeCleartextHandles output", () => {
    const { handles } = computeCleartextHandles({
      values: [42n],
      encryptionBits: [64],
      aclContractAddress: ACL_ADDRESS,
      chainId: CHAIN_ID,
    });

    const parsed = parseHandle(handles[0]!);

    expect(parsed.index).toBe(0);
    expect(parsed.chainId).toBe(BigInt(CHAIN_ID));
    expect(parsed.fheTypeId).toBe(BITS_TO_FHE_TYPE[64]);
    expect(parsed.version).toBe(0);
    // hash21 should be a 21-byte hex string (0x + 42 hex chars)
    expect(parsed.hash21).toMatch(/^0x[0-9a-f]{42}$/);
  });

  it("rejects input that is not 32 bytes", () => {
    expect(() => parseHandle("0xdeadbeef")).toThrow("Expected 32 bytes");
  });
});
