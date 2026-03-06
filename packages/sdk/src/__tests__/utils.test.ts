import { describe, it, expect } from "../test-fixtures";
import { toHex } from "viem";

describe("toHex", () => {
  it("converts empty Uint8Array to 0x", () => {
    expect(toHex(new Uint8Array([]))).toBe("0x");
  });

  it("converts single byte", () => {
    expect(toHex(new Uint8Array([0xff]))).toBe("0xff");
  });

  it("pads single-digit hex values with leading zero", () => {
    expect(toHex(new Uint8Array([0x0a]))).toBe("0x0a");
    expect(toHex(new Uint8Array([0x00]))).toBe("0x00");
  });

  it("converts multiple bytes", () => {
    expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("0xdeadbeef");
  });

  it("converts a 32-byte value", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(toHex(bytes)).toBe("0x" + "ab".repeat(32));
  });
});
