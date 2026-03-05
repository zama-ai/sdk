import { describe, expect, it } from "../../test-fixtures";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";

describe("Address normalization (P6)", () => {
  it("preserves token address case in constructor", ({
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

    expect(token.address).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("preserves wrapper address case in constructor", ({
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

    expect(token.wrapper).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("defaults wrapper to normalized address when not provided", ({
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

    expect(token.wrapper).toBe(token.address);
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
    ).toThrow("address must be a valid address");
  });
});
