import { describe, it, expect } from "../../test-fixtures";
import { getAddress, type Address } from "viem";
import { coversContracts, normalizeAddresses } from "../utils";

const A_LOWER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const B_LOWER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const A_CHK = getAddress(A_LOWER);
const B_CHK = getAddress(B_LOWER);

describe("coversContracts", () => {
  it.each([
    {
      label: "case-insensitive coverage",
      signed: [A_CHK],
      required: [A_LOWER],
      expected: true,
    },
    {
      label: "missing address",
      signed: [A_LOWER],
      required: [A_LOWER, B_LOWER],
      expected: false,
    },
    {
      label: "empty required is vacuously covered",
      signed: [],
      required: [],
      expected: true,
    },
  ])("$label -> $expected", ({ signed, required, expected }) => {
    expect(coversContracts(signed, required)).toBe(expected);
  });
});

describe("normalizeAddresses", () => {
  it("deduplicates and sorts checksummed", () => {
    expect(normalizeAddresses([B_LOWER, A_LOWER, A_LOWER])).toEqual([A_CHK, B_CHK]);
  });
});
