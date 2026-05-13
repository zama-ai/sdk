import type { Address } from "viem";
import { describe, expect, it } from "../../test-fixtures";
import { Token } from "../../token/token";
import { WrappedToken } from "../../token/wrapped-token";

const ADDR_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ADDR_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

describe("TokensClient", () => {
  describe("confidential", () => {
    it("returns a Token bound to the SDK", ({ sdk }) => {
      const token = sdk.tokens.confidential(ADDR_A);
      expect(token).toBeInstanceOf(Token);
      expect(token.address).toBe(ADDR_A);
      expect(token.sdk).toBe(sdk);
    });

    it("returns distinct instances per call", ({ sdk }) => {
      const t1 = sdk.tokens.confidential(ADDR_A);
      const t2 = sdk.tokens.confidential(ADDR_A);
      expect(t1).not.toBe(t2);
    });

    it("works without a signer", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(sdk.tokens.confidential(ADDR_A)).toBeInstanceOf(Token);
    });
  });

  describe("wrapper", () => {
    it("returns a WrappedToken bound to the SDK", ({ sdk }) => {
      const wrapped = sdk.tokens.wrapper(ADDR_B);
      expect(wrapped).toBeInstanceOf(WrappedToken);
      expect(wrapped).toBeInstanceOf(Token);
      expect(wrapped.address).toBe(ADDR_B);
      expect(wrapped.sdk).toBe(sdk);
    });

    it("returns distinct instances per call", ({ sdk }) => {
      const w1 = sdk.tokens.wrapper(ADDR_B);
      const w2 = sdk.tokens.wrapper(ADDR_B);
      expect(w1).not.toBe(w2);
    });

    it("works without a signer", ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      expect(sdk.tokens.wrapper(ADDR_B)).toBeInstanceOf(WrappedToken);
    });
  });
});
