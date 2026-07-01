import { describe, test, expect, vi } from "../test-fixtures";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import type { Address } from "viem";
import type { EncryptParams } from "../relayer/types";

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

  test("terminate disposes the SDK and signer", ({ createMockSigner, createSDK }) => {
    const dispose = vi.fn();
    const sdk = createSDK({ signer: { ...createMockSigner(), dispose } });
    const sdkDispose = vi.spyOn(sdk, "dispose");

    sdk.terminate();

    expect(sdkDispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  test("[Symbol.dispose] delegates to terminate", ({ sdk }) => {
    const terminate = vi.spyOn(sdk, "terminate");

    sdk[Symbol.dispose]();

    expect(terminate).toHaveBeenCalledOnce();
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

    test("returns encrypted values", async ({ sdk, handle, inputProof }) => {
      const result = await sdk.encrypt(ENCRYPT_PARAMS);

      expect(result.encryptedValues).toEqual([handle]);
      expect(result.inputProof).toBe(inputProof);
    });

    test("works without a signer", async ({ createSDK, handle, inputProof }) => {
      const sdk = createSDK({ signer: undefined });

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).resolves.toEqual({
        encryptedValues: [handle],
        inputProof,
      });
    });
  });
});
