import { describe, it, expect } from "../../test-fixtures";
import { prefixHex, unprefixHex } from "..";
import { toHex, toBytes, keccak256, isHex } from "../hex";

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

describe("hex prefix helpers", () => {
  it("adds a prefix when the relayer SDK returns bare hex", () => {
    expect(prefixHex("abcd")).toBe("0xabcd");
  });

  it("preserves an existing 0x prefix", () => {
    expect(prefixHex("0xabcd")).toBe("0xabcd");
  });

  it("removes the 0x prefix for relayer SDK inputs", () => {
    expect(unprefixHex("0xabcd")).toBe("abcd");
  });

  it("throws when value lacks 0x prefix", () => {
    expect(() => unprefixHex("abcd" as `0x${string}`)).toThrow("Expected 0x-prefixed hex");
  });
});

describe("isHex", () => {
  it("accepts valid hex strings", () => {
    expect(isHex("0x")).toBe(true);
    expect(isHex("0xdeadbeef")).toBe(true);
    expect(isHex("0x0")).toBe(true);
    expect(isHex("0xABCDEF0123456789")).toBe(true);
  });

  it("rejects invalid hex strings", () => {
    expect(isHex("")).toBe(false);
    expect(isHex("0x")).toBe(true);
    expect(isHex("deadbeef")).toBe(false);
    expect(isHex("0xGHIJ")).toBe(false);
    expect(isHex("0x123z")).toBe(false);
  });
});

describe("keccak256", () => {
  it("hashes empty bytes", () => {
    const result = keccak256(new Uint8Array([]));
    // Known keccak256 of empty input
    expect(result).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });

  it("hashes 'hello'", () => {
    const result = keccak256(new TextEncoder().encode("hello"));
    expect(result).toBe("0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8");
  });

  it("returns 0x-prefixed 66-char string", () => {
    const result = keccak256(new Uint8Array([0xff]));
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("toBytes", () => {
  it("encodes ASCII string", () => {
    const bytes = toBytes("abc");
    expect(bytes).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
  });

  it("encodes empty string", () => {
    expect(toBytes("")).toEqual(new Uint8Array([]));
  });

  it("encodes UTF-8 multi-byte characters", () => {
    const bytes = toBytes("\u00e9"); // é
    expect(bytes.length).toBe(2);
  });
});
