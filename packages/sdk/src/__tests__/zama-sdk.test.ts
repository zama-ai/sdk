import { describe, test, expect, vi } from "../test-fixtures";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import type { Address } from "viem";
import type { EncryptParams } from "../relayer/relayer-sdk.types";

describe("ZamaSDK", () => {
  test("exposes signer and storage", ({ sdk, signer, storage }) => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  test("createToken returns Token", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  test("createToken exposes the SDK instance", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  test("creates distinct instances per address", ({ sdk }) => {
    const t1 = sdk.createToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(t2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  test("createWrappedToken returns WrappedToken (extending Token)", ({ sdk, wrapperAddress }) => {
    const wrapped = sdk.createWrappedToken(wrapperAddress);
    expect(wrapped).toBeInstanceOf(WrappedToken);
    expect(wrapped).toBeInstanceOf(Token);
    expect(wrapped.address).toBe(wrapperAddress);
    expect(wrapped.sdk).toBe(sdk);
  });

  test("createWrappedToken yields distinct instances per address", ({ sdk }) => {
    const w1 = sdk.createWrappedToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const w2 = sdk.createWrappedToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(w1).not.toBe(w2);
    expect(w1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(w2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  test("terminate delegates to relayer.terminate", ({ sdk, relayer }) => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  test("[Symbol.dispose] delegates to terminate", ({ sdk, relayer }) => {
    sdk[Symbol.dispose]();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  test("terminate calls signer.dispose", ({ createMockSigner, createSDK }) => {
    const dispose = vi.fn();
    const sdk = createSDK({ signer: { ...createMockSigner(), dispose } });

    sdk.terminate();

    expect(dispose).toHaveBeenCalledOnce();
  });

  describe("encrypt", () => {
    const ENCRYPT_PARAMS: EncryptParams = {
      values: [{ value: 100n, type: "euint64" as const }],
      contractAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
      userAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
    };

    test("returns encrypted handles", async ({ sdk }) => {
      const result = await sdk.encrypt(ENCRYPT_PARAMS);

      expect(result.handles).toHaveLength(1);
      expect(result.inputProof).toBe("0x040506");
    });

    test("works without a signer", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).resolves.toEqual({
        handles: ["0x010203"],
        inputProof: "0x040506",
      });
    });
  });
});
