import { describe, expect, it } from "vitest";
import { decodeDecryptedValue } from "../decode-decrypted-value";

describe("decodeDecryptedValue", () => {
  it("decodes bool true", () => {
    expect(decodeDecryptedValue(1n, "bool")).toBe(true);
  });

  it("decodes bool false", () => {
    expect(decodeDecryptedValue(0n, "bool")).toBe(false);
  });

  it("decodes address", () => {
    const addr = BigInt("0x1111111111111111111111111111111111111111");
    const result = decodeDecryptedValue(addr, "address");
    expect(result).toBe("0x1111111111111111111111111111111111111111");
  });

  it("decodes address with zero-padding", () => {
    const result = decodeDecryptedValue(1n, "address");
    expect(result).toBe("0x0000000000000000000000000000000000000001");
  });

  it("returns bigint as-is for uint types", () => {
    expect(decodeDecryptedValue(42n, "uint64")).toBe(42n);
    expect(decodeDecryptedValue(100n, "uint8")).toBe(100n);
    expect(decodeDecryptedValue(0n, "uint256")).toBe(0n);
  });

  it("returns bigint as-is for bytes types", () => {
    expect(decodeDecryptedValue(42n, "bytes64")).toBe(42n);
  });
});
