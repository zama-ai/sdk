import { describe, it, expect } from "../test-fixtures";
import { normalizeAddress } from "../utils";

describe("normalizeAddress", () => {
  it("preserves a checksummed address", () => {
    const checksummed = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const result = normalizeAddress(checksummed, "test");
    expect(result).toBe(checksummed);
  });

  it("returns a lowercase address unchanged", () => {
    const lower = "0x1111111111111111111111111111111111111111";
    const result = normalizeAddress(lower, "test");
    expect(result).toBe(lower);
  });

  it("preserves mixed-case address", () => {
    const mixed = "0xABCDEF1234567890abcdef1234567890ABCDEF12";
    const result = normalizeAddress(mixed, "test");
    expect(result).toBe(mixed);
  });

  it("throws for invalid address (too short)", () => {
    expect(() => normalizeAddress("0x1234", "addr")).toThrow("addr must be a valid address");
  });

  it("throws for missing 0x prefix", () => {
    expect(() => normalizeAddress("1111111111111111111111111111111111111111", "addr")).toThrow(
      "addr must be a valid address",
    );
  });

  it("throws for non-hex characters", () => {
    expect(() => normalizeAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", "addr")).toThrow(
      "addr must be a valid address",
    );
  });
});
