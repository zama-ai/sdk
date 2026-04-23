import { keccak256 as viemKeccak256, toBytes as viemToBytes, toHex as viemToHex } from "viem";
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

  it("matches viem toHex for various inputs", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0xff]),
      new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      new Uint8Array(32).fill(0xab),
      new Uint8Array(20).fill(0x01),
    ];
    for (const input of cases) {
      expect(toHex(input)).toBe(viemToHex(input));
    }
  });
});

describe("toBytes", () => {
  it("encodes ASCII string", () => {
    expect(toBytes("abc")).toEqual(new Uint8Array([0x61, 0x62, 0x63]));
  });

  it("encodes empty string", () => {
    expect(toBytes("")).toEqual(new Uint8Array([]));
  });

  it("encodes UTF-8 multi-byte characters", () => {
    const bytes = toBytes("\u00e9"); // é
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0xc3);
    expect(bytes[1]).toBe(0xa9);
  });

  it("roundtrips with toHex", () => {
    const text = "hello world";
    const bytes = toBytes(text);
    const hex = toHex(bytes);
    expect(hex).toBe("0x" + Buffer.from(text).toString("hex"));
  });
});

describe("keccak256", () => {
  it("hashes empty bytes to known value", () => {
    expect(keccak256(new Uint8Array([]))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("returns 0x-prefixed 66-char string", () => {
    const result = keccak256(new Uint8Array([0xff]));
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("matches viem keccak256 for various inputs", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0xff]),
      new TextEncoder().encode("hello"),
      new TextEncoder().encode("Transfer(address,address,uint256)"),
      new Uint8Array(32).fill(0x00),
      new Uint8Array(32).fill(0xff),
    ];
    for (const input of cases) {
      expect(keccak256(input)).toBe(viemKeccak256(input));
    }
  });

  it("produces correct event topic for Transfer signature", () => {
    const sig = "Transfer(address,address,uint256)";
    const topic = keccak256(toBytes(sig));
    // Well-known Transfer topic0
    expect(topic).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });

  it("produces correct event topic for ConfidentialTransfer signature", () => {
    const sig = "ConfidentialTransfer(address,address,bytes32)";
    const topic = keccak256(toBytes(sig));
    expect(topic).toBe(viemKeccak256(viemToBytes(sig)));
  });

  it("different inputs produce different hashes", () => {
    const a = keccak256(new Uint8Array([0x01]));
    const b = keccak256(new Uint8Array([0x02]));
    expect(a).not.toBe(b);
  });
});

describe("isHex", () => {
  it("accepts bare 0x prefix", () => {
    expect(isHex("0x")).toBe(true);
  });

  it("accepts valid hex strings", () => {
    expect(isHex("0x0")).toBe(true);
    expect(isHex("0xdeadbeef")).toBe(true);
    expect(isHex("0xABCDEF0123456789")).toBe(true);
    expect(isHex("0x" + "ab".repeat(32))).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isHex("")).toBe(false);
  });

  it("rejects missing prefix", () => {
    expect(isHex("deadbeef")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isHex("0xGHIJ")).toBe(false);
    expect(isHex("0x123z")).toBe(false);
    expect(isHex("0x ")).toBe(false);
  });
});

describe("prefixHex / unprefixHex", () => {
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

  it("roundtrips", () => {
    expect(unprefixHex(prefixHex("deadbeef"))).toBe("deadbeef");
    expect(prefixHex(unprefixHex("0xdeadbeef"))).toBe("0xdeadbeef");
  });
});
