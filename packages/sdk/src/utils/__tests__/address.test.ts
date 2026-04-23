import { getAddress as viemGetAddress } from "viem";
import { describe, it, expect } from "../../test-fixtures";
import { checksumAddress, getAddress, isAddress, zeroAddress } from "../address";

describe("isAddress", () => {
  it("accepts valid lowercase address", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(true);
  });

  it("accepts valid checksummed address", () => {
    expect(isAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });

  it("accepts all-uppercase hex", () => {
    expect(isAddress("0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045")).toBe(true);
  });

  it("accepts zero address", () => {
    expect(isAddress(zeroAddress)).toBe(true);
  });

  it("rejects too short", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03")).toBe(false);
  });

  it("rejects too long (42 hex chars after 0x)", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045aa")).toBe(false);
  });

  it("rejects missing 0x prefix", () => {
    expect(isAddress("d8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa9604g")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAddress("")).toBe(false);
  });

  it("rejects bare 0x", () => {
    expect(isAddress("0x")).toBe(false);
  });

  describe("strict mode (default)", () => {
    it("accepts all-lowercase (no checksum to verify)", () => {
      expect(isAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(true);
    });

    it("accepts all-uppercase (no checksum to verify)", () => {
      expect(isAddress("0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045")).toBe(true);
    });

    it("accepts correctly checksummed mixed-case", () => {
      expect(isAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    });

    it("rejects incorrectly checksummed mixed-case", () => {
      // Flip one letter's case to break the checksum
      expect(isAddress("0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
    });
  });

  describe("strict: false", () => {
    it("accepts any valid hex address regardless of casing", () => {
      // Wrong checksum but valid hex — strict: false should accept
      expect(isAddress("0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045", { strict: false })).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// checksumAddress — EIP-55 compliance
// ---------------------------------------------------------------------------

describe("checksumAddress", () => {
  // EIP-55 test vectors from the spec
  const EIP55_VECTORS: [string, string][] = [
    // all-caps
    ["0x52908400098527886E0F7030069857D2E4169EE7", "0x52908400098527886E0F7030069857D2E4169EE7"],
    ["0x8617E340B3D01FA5F11F306F4090FD50E238070D", "0x8617E340B3D01FA5F11F306F4090FD50E238070D"],
    // all-lower
    ["0xde709f2102306220921060314715629080e2fb77", "0xde709f2102306220921060314715629080e2fb77"],
    ["0x27b1fdb04752bbc536007a920d24acb045561c26", "0x27b1fdb04752bbc536007a920d24acb045561c26"],
    // mixed
    ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
    ["0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"],
    ["0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB"],
    ["0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"],
  ];

  it.each(EIP55_VECTORS)("checksums %s correctly", (input, expected) => {
    expect(checksumAddress(input.toLowerCase())).toBe(expected);
  });

  it("matches viem getAddress for EIP-55 vectors", () => {
    for (const [, expected] of EIP55_VECTORS) {
      expect(checksumAddress(expected.toLowerCase())).toBe(viemGetAddress(expected.toLowerCase()));
    }
  });

  it("matches viem for well-known addresses", () => {
    const addresses = [
      "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", // vitalik.eth
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      "0x0000000000000000000000000000000000000000", // zero
      "0xffffffffffffffffffffffffffffffffffffffff", // max
    ];
    for (const addr of addresses) {
      expect(checksumAddress(addr)).toBe(viemGetAddress(addr));
    }
  });

  it("is idempotent", () => {
    const addr = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
    const once = checksumAddress(addr);
    const twice = checksumAddress(once);
    expect(twice).toBe(once);
  });

  it("handles all-uppercase input", () => {
    expect(checksumAddress("0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045")).toBe(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });

  it("checksums zero address (all nibbles < 8)", () => {
    expect(checksumAddress(zeroAddress)).toBe(zeroAddress);
  });

  it("throws on invalid input", () => {
    expect(() => checksumAddress("0xinvalid")).toThrow("is invalid");
    expect(() => checksumAddress("not-an-address")).toThrow("is invalid");
    expect(() => checksumAddress("")).toThrow("is invalid");
    expect(() => checksumAddress("0x")).toThrow("is invalid");
    // too short
    expect(() => checksumAddress("0xdead")).toThrow("is invalid");
  });
});

describe("getAddress", () => {
  it("is the same function as checksumAddress", () => {
    expect(getAddress).toBe(checksumAddress);
  });
});

describe("zeroAddress", () => {
  it("is a valid address", () => {
    expect(isAddress(zeroAddress)).toBe(true);
  });

  it("equals the canonical zero address", () => {
    expect(zeroAddress).toBe("0x0000000000000000000000000000000000000000");
  });

  it("matches viem zero address checksum", () => {
    expect(checksumAddress(zeroAddress)).toBe(viemGetAddress(zeroAddress));
  });
});
