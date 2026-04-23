import { describe, it, expect } from "../../test-fixtures";
import { checksumAddress, getAddress, isAddress, zeroAddress } from "../address";

describe("isAddress", () => {
  it("accepts valid lowercase address", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(true);
  });

  it("accepts valid checksummed address", () => {
    expect(isAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });

  it("accepts zero address", () => {
    expect(isAddress("0x0000000000000000000000000000000000000000")).toBe(true);
  });

  it("rejects too short", () => {
    expect(isAddress("0xd8da6bf26964af9d7eed9e03")).toBe(false);
  });

  it("rejects too long", () => {
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
});

describe("checksumAddress", () => {
  it("checksums vitalik.eth address correctly", () => {
    expect(checksumAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });

  it("is idempotent on already-checksummed address", () => {
    const checksummed = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    expect(checksumAddress(checksummed)).toBe(checksummed);
  });

  it("checksums all-uppercase address", () => {
    expect(checksumAddress("0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045")).toBe(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });

  it("checksums zero address", () => {
    expect(checksumAddress(zeroAddress)).toBe(zeroAddress);
  });

  it("throws on invalid address", () => {
    expect(() => checksumAddress("0xinvalid")).toThrow('Address "0xinvalid" is invalid.');
    expect(() => checksumAddress("not-an-address")).toThrow("is invalid");
    expect(() => checksumAddress("")).toThrow("is invalid");
  });
});

describe("getAddress", () => {
  it("is an alias for checksumAddress", () => {
    expect(getAddress).toBe(checksumAddress);
  });

  it("returns checksummed address", () => {
    expect(getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });
});

describe("zeroAddress", () => {
  it("is a valid address", () => {
    expect(isAddress(zeroAddress)).toBe(true);
  });

  it("is 40 zeroes", () => {
    expect(zeroAddress).toBe("0x0000000000000000000000000000000000000000");
  });
});
