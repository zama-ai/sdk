import { describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import { computeStoreKey } from "../storage-keys";
import { coversContracts, normalizeAddresses } from "../utils";

describe("computeStoreKey", () => {
  it("returns 32 hex chars", async () => {
    const key = await computeStoreKey("0xabc", 1);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
  it("differs by chain id", async () => {
    const a = await computeStoreKey("0xabc", 1);
    const b = await computeStoreKey("0xabc", 2);
    expect(a).not.toBe(b);
  });
});

describe("normalizeAddresses", () => {
  it("deduplicates and sorts checksummed", () => {
    const a: Address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b: Address = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const result = normalizeAddresses([b, a, a]);
    expect(result).toEqual([getAddress(a), getAddress(b)]);
  });
});

describe("coversContracts", () => {
  it("returns true when signed covers required (case-insensitive)", () => {
    const a = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const A = getAddress(a);
    expect(coversContracts([A], [a])).toBe(true);
  });
  it("returns false when missing", () => {
    const a = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const b = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
    expect(coversContracts([a], [a, b])).toBe(false);
  });
  it("returns true when required is empty", () => {
    expect(coversContracts([], [])).toBe(true);
  });
});
