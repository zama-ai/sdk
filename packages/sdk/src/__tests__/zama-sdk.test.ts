import { describe, it, expect, vi } from "../test-fixtures";
import { Token } from "../token/token";
import { WrappedToken } from "../token/wrapped-token";
import { DecryptionFailedError, SignerNotConfiguredError } from "../errors";
import type { Address } from "viem";
import type { DecryptHandle } from "../query/user-decrypt";
import type { EncryptParams } from "../relayer/relayer-sdk.types";

describe("ZamaSDK", () => {
  it("exposes signer and storage", ({ sdk, signer, storage }) => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createToken returns Token", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("createToken exposes the SDK instance", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("creates distinct instances per address", ({ sdk }) => {
    const t1 = sdk.createToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(t2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  it("createWrappedToken returns WrappedToken (extending Token)", ({ sdk, wrapperAddress }) => {
    const wrapped = sdk.createWrappedToken(wrapperAddress);
    expect(wrapped).toBeInstanceOf(WrappedToken);
    expect(wrapped).toBeInstanceOf(Token);
    expect(wrapped.address).toBe(wrapperAddress);
    expect(wrapped.sdk).toBe(sdk);
  });

  it("createWrappedToken yields distinct instances per address", ({ sdk }) => {
    const w1 = sdk.createWrappedToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const w2 = sdk.createWrappedToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(w1).not.toBe(w2);
    expect(w1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(w2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  it("terminate delegates to relayer.terminate", ({ sdk, relayer }) => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("[Symbol.dispose] delegates to terminate", ({ sdk, relayer }) => {
    sdk[Symbol.dispose]();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("terminate calls signer.dispose", ({ createMockSigner, createSDK }) => {
    const dispose = vi.fn();
    const sdk = createSDK({ signer: { ...createMockSigner(), dispose } });

    sdk.terminate();

    expect(dispose).toHaveBeenCalledOnce();
  });

  describe("publicDecrypt", () => {
    it("delegates to relayer.publicDecrypt and returns the result", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const result = await sdk.decrypt.public([handle]);
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
      expect(result).toEqual({
        clearValues: { [handle]: 500n },
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    });

    it("returns empty result for empty handles without calling relayer", async ({
      sdk,
      relayer,
    }) => {
      const result = await sdk.decrypt.public([]);
      expect(result).toEqual({
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      });
      expect(relayer.publicDecrypt).not.toHaveBeenCalled();
    });

    it("wraps error on failure", async ({ sdk, relayer, handle }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(sdk.decrypt.public([handle])).rejects.toThrow(DecryptionFailedError);
    });

    it("re-throws DecryptionFailedError as-is", async ({ sdk, relayer, handle }) => {
      const original = new DecryptionFailedError("already typed");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(sdk.decrypt.public([handle])).rejects.toBe(original);
    });
  });

  describe("grantPermit", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("triggers a wallet signature when no permit is cached", async ({ sdk, signer }) => {
      await sdk.permits.grantPermit([CONTRACT_A, CONTRACT_B]);
      expect(signer.signTypedData).toHaveBeenCalled();
    });

    it("returns immediately for empty array without calling the signer", async ({
      sdk,
      signer,
    }) => {
      await sdk.permits.grantPermit([]);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("revokePermits clears decrypt cache", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("revokePermits() clears cache — decrypt after revokePermits hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits();

      // Cache was cleared — relayer is called again
      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("revokePermits(addresses) clears cache for the requester", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits([CONTRACT_A]);

      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });

  describe("encrypt", () => {
    const ENCRYPT_PARAMS: EncryptParams = {
      values: [{ value: 100n, type: "euint64" as const }],
      contractAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
      userAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
    };

    it("returns encrypted handles", async ({ sdk }) => {
      const result = await sdk.encrypt(ENCRYPT_PARAMS);

      expect(result.handles).toHaveLength(1);
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
    });

    it("works without a signer", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).resolves.toEqual({
        handles: [new Uint8Array([1, 2, 3])],
        inputProof: new Uint8Array([4, 5, 6]),
      });
    });
  });

  describe("delegation signer guards", () => {
    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.delegate({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.revoke({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });
});
