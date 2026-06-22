import { describe, expect, test } from "../../test-fixtures";

import { Token } from "../token";
import { WrappedToken } from "../wrapped-token";
import type { Address } from "viem";

describe("Address normalization (P6)", () => {
  test("checksums Token address in constructor", ({ sdk }) => {
    const token = new Token(sdk, "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address);

    expect(token.address).toBe("0xabCDEF1234567890ABcDEF1234567890aBCDeF12");
  });

  test("checksums WrappedToken address in constructor", ({ sdk }) => {
    const token = new WrappedToken(sdk, "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address);

    expect(token.address).toBe("0xabCDEF1234567890ABcDEF1234567890aBCDeF12");
  });

  test("rejects invalid address in Token constructor", ({ sdk }) => {
    expect(() => new Token(sdk, "0xinvalid" as Address)).toThrow('Address "0xinvalid" is invalid.');
  });

  test("rejects invalid address in WrappedToken constructor", ({ sdk }) => {
    expect(() => new WrappedToken(sdk, "0xinvalid" as Address)).toThrow(
      'Address "0xinvalid" is invalid.',
    );
  });
});
