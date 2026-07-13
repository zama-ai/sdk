import { describe, test, expect } from "../../test-fixtures";
import type { EncryptedValue } from "../../relayer/types";
import { chunkHandlesByBitBudget, encryptionBitsForHandle } from "../handles";

/** Build a 32-byte handle with `typeId` at byte 30 (bits 8-15) and version 0 at byte 31. */
function makeHandle(typeId: number, filler = "aa"): EncryptedValue {
  return `0x${filler.repeat(30)}${typeId.toString(16).padStart(2, "0")}00` as EncryptedValue;
}

describe("encryptionBitsForHandle", () => {
  test.each([
    [0, 2], // ebool
    [2, 8], // euint8
    [3, 16], // euint16
    [4, 32], // euint32
    [5, 64], // euint64
    [6, 128], // euint128
    [7, 160], // eaddress
    [8, 256], // euint256
  ])("maps FheTypeId %i to %i bits", (typeId, expectedBits) => {
    expect(encryptionBitsForHandle(makeHandle(typeId))).toBe(expectedBits);
  });

  test("falls back to 256 bits for an unrecognized type byte instead of throwing", () => {
    // Byte 30 = 0xab is not a valid FheTypeId (matches the shared VALID_ENCRYPTED_VALUE fixture shape).
    const handle = ("0x" + "ab".repeat(32)) as EncryptedValue;
    expect(() => encryptionBitsForHandle(handle)).not.toThrow();
    expect(encryptionBitsForHandle(handle)).toBe(256);
  });

  test("falls back to 256 bits for the deprecated euint4 type id (1)", () => {
    expect(encryptionBitsForHandle(makeHandle(1))).toBe(256);
  });
});

describe("chunkHandlesByBitBudget", () => {
  test("returns an empty array for empty input", () => {
    expect(chunkHandlesByBitBudget([])).toEqual([]);
  });

  test("keeps handles that fit within the budget in a single chunk", () => {
    const handles = [makeHandle(5, "a1"), makeHandle(5, "a2"), makeHandle(5, "a3")]; // euint64 x3 = 192 bits
    expect(chunkHandlesByBitBudget(handles)).toEqual([handles]);
  });

  test("splits handles once the budget is exceeded", () => {
    // euint256 (256 bits) x 9 = 2304 bits > 2048 — must split into 8 + 1.
    const handles = Array.from({ length: 9 }, (_, i) =>
      makeHandle(8, i.toString(16).padStart(2, "0")),
    );
    const chunks = chunkHandlesByBitBudget(handles);
    expect(chunks).toEqual([handles.slice(0, 8), handles.slice(8)]);
  });

  test("packs mixed bit-widths greedily without exceeding the budget", () => {
    const wide = makeHandle(8, "b1"); // euint256, 256 bits
    const narrow = makeHandle(0, "b2"); // ebool, 2 bits
    const handles = [wide, narrow, wide, narrow];
    const chunks = chunkHandlesByBitBudget(handles, 300);
    for (const chunk of chunks) {
      const total = chunk.reduce((sum, h) => sum + encryptionBitsForHandle(h), 0);
      expect(total).toBeLessThanOrEqual(300);
    }
    expect(chunks.flat()).toEqual(handles);
  });

  test("a handle whose own cost exceeds maxBits still gets a solo chunk", () => {
    const oversized = makeHandle(8, "c1"); // 256 bits
    expect(chunkHandlesByBitBudget([oversized], 100)).toEqual([[oversized]]);
  });

  test("respects a custom maxBits boundary exactly", () => {
    const a = makeHandle(4, "d1"); // euint32, 32 bits
    const b = makeHandle(4, "d2"); // euint32, 32 bits
    expect(chunkHandlesByBitBudget([a, b], 64)).toEqual([[a, b]]);
    expect(chunkHandlesByBitBudget([a, b], 63)).toEqual([[a], [b]]);
  });
});
