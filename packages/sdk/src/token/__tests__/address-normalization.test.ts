import { describe, expect, it } from "../../test-fixtures";

import { Token } from "../token";
import type { Address } from "viem";

describe("Address normalization (P6)", () => {
  it("checksummed token address in constructor", ({ relayer, signer, storage, sessionStorage }) => {
    const token = new Token({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.address).toBe("0xabCDEF1234567890ABcDEF1234567890aBCDeF12");
  });

  it("checksummed wrapper address in constructor", ({
    relayer,
    signer,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    const token = new Token({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe("0xabCDEF1234567890ABcDEF1234567890aBCDeF12");
  });

  it("defaults wrapper to checksummed address when not provided", ({
    relayer,
    signer,
    storage,
    sessionStorage,
  }) => {
    const token = new Token({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe("0xabCDEF1234567890ABcDEF1234567890aBCDeF12");
  });

  it("rejects invalid address in constructor", ({ relayer, signer, storage, sessionStorage }) => {
    expect(
      () =>
        new Token({
          relayer,
          signer,
          storage,
          sessionStorage,
          address: "0xinvalid" as Address,
        }),
    ).toThrow('Address "0xinvalid" is invalid.');
  });
});
