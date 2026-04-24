import { describe, it, expect, vi } from "../../test-fixtures";
import { ReadonlyToken, ZERO_HANDLE } from "../readonly-token";
import { DecryptionFailedError, ZamaError } from "../../errors";
import { getAddress, type Address } from "viem";

const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const VALID_HANDLE2 = ("0x" + "cd".repeat(32)) as Address;
const OWNER = "0x3F3f3f3F3F3f3F3f3F3f3f3F3F3f3F3f3f3f3f3F" as Address;

describe("ReadonlyToken", () => {
  describe("balanceOf", () => {
    it("returns 0n for zero handle without hitting relayer", async ({
      readonlyToken,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);
      const balance = await readonlyToken.balanceOf(OWNER);

      expect(balance).toBe(0n);
      expect(readonlyToken.sdk.relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async ({
      readonlyToken,
      handle,
      tokenAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(readonlyToken.sdk.relayer.userDecrypt).mockResolvedValue({
        [handle]: 1000n,
      });

      const balance = await readonlyToken.balanceOf(OWNER);

      expect(balance).toBe(1000n);
      expect(readonlyToken.sdk.relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [handle],
          contractAddress: tokenAddress,
        }),
      );
    });

    it("throws ZamaError on decryption failure", async ({ readonlyToken, handle, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(readonlyToken.sdk.relayer.userDecrypt).mockRejectedValue(new Error("relayer down"));

      await expect(readonlyToken.balanceOf(OWNER)).rejects.toBeInstanceOf(ZamaError);
    });
  });

  describe("allowance", () => {
    it("reads underlying token then checks allowance", async ({ readonlyToken, provider }) => {
      const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING) // underlying()
        .mockResolvedValueOnce(500n); // allowance()

      const result = await readonlyToken.allowance(
        "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address,
        OWNER,
      );

      expect(result).toBe(500n);
      expect(provider.readContract).toHaveBeenCalledTimes(2);
      expect(provider.readContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "underlying" }),
      );
      expect(provider.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "allowance" }),
      );
    });
  });

  describe("batchBalancesOf", () => {
    it("returns empty maps for empty input", async () => {
      const { results, errors } = await ReadonlyToken.batchBalancesOf([], OWNER);
      expect(results.size).toBe(0);
      expect(errors.size).toBe(0);
    });

    it("pre-authorizes the full token set in one signature", async ({
      sdk,
      signer,
      tokenAddress,
      handle,
      provider,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const token2 = new ReadonlyToken(sdk, TOKEN2);
      const normalizedToken2 = getAddress(TOKEN2);
      // Both balanceOf calls run concurrently — key mocks by address.
      vi.mocked(provider.readContract).mockImplementation(async ({ address }) => {
        if (address === tokenAddress) {
          return handle;
        }
        if (address === normalizedToken2) {
          return VALID_HANDLE2;
        }
        throw new Error(`Unexpected readContract address ${address}`);
      });
      vi.mocked(sdk.relayer.userDecrypt).mockResolvedValue({
        [handle]: 1000n,
        [VALID_HANDLE2]: 2000n,
      });

      const { results, errors } = await ReadonlyToken.batchBalancesOf([token1, token2], OWNER);

      expect(errors.size).toBe(0);
      expect(results.get(tokenAddress)).toBe(1000n);
      expect(results.get(getAddress(TOKEN2))).toBe(2000n);
      // Single wallet signature covering both tokens.
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("captures per-token decryption failures in the errors map", async ({
      sdk,
      tokenAddress,
      handle,
      provider,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const token2 = new ReadonlyToken(sdk, TOKEN2);
      const normalizedToken2 = getAddress(TOKEN2);
      // Both balanceOf calls run concurrently via pLimit — key mocks by
      // contract address so ordering doesn't matter.
      vi.mocked(provider.readContract).mockImplementation(async ({ address }) => {
        if (address === tokenAddress) {
          return handle;
        }
        if (address === normalizedToken2) {
          return VALID_HANDLE2;
        }
        throw new Error(`Unexpected readContract address ${address}`);
      });
      vi.mocked(sdk.relayer.userDecrypt).mockImplementation(
        async ({ contractAddress, handles }) => {
          if (contractAddress === tokenAddress) {
            return { [handles[0]]: 1000n };
          }
          throw new Error("relayer down for token2");
        },
      );

      const { results, errors } = await ReadonlyToken.batchBalancesOf([token1, token2], OWNER);

      expect(results.get(tokenAddress)).toBe(1000n);
      expect(results.get(normalizedToken2)).toBeUndefined();
      expect(errors.get(normalizedToken2)).toBeInstanceOf(ZamaError);
    });

    it("throws when tokens come from different SDK instances", async ({
      sdk,
      createSDK,
      tokenAddress,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const otherSdk = createSDK();
      const token2 = new ReadonlyToken(otherSdk, TOKEN2);

      await expect(ReadonlyToken.batchBalancesOf([token1, token2], OWNER)).rejects.toThrow(
        /must share the same ZamaSDK/,
      );
    });

    it("throws when every token fails to decrypt", async ({
      sdk,
      tokenAddress,
      handle,
      provider,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const token2 = new ReadonlyToken(sdk, TOKEN2);
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(handle)
        .mockResolvedValueOnce(VALID_HANDLE2);
      vi.mocked(sdk.relayer.userDecrypt).mockRejectedValue(new Error("relayer offline"));

      await expect(ReadonlyToken.batchBalancesOf([token1, token2], OWNER)).rejects.toBeInstanceOf(
        ZamaError,
      );
    });

    it("wraps non-ZamaError per-token failures as DecryptionFailedError preserving the cause", async ({
      sdk,
      tokenAddress,
      handle,
      provider,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const token2 = new ReadonlyToken(sdk, TOKEN2);
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(handle)
        .mockResolvedValueOnce(VALID_HANDLE2);
      const rawError = new TypeError("malformed response");
      vi.mocked(sdk.relayer.userDecrypt)
        .mockImplementationOnce(async ({ handles }) => ({
          [handles[0]]: 1000n,
        }))
        .mockImplementationOnce(async () => {
          throw rawError;
        });

      const { errors } = await ReadonlyToken.batchBalancesOf([token1, token2], OWNER);

      const err = errors.get(getAddress(TOKEN2));
      expect(err).toBeInstanceOf(DecryptionFailedError);
    });
  });

  describe("allow", () => {
    it("returns immediately when called with no tokens", async ({ relayer, signer }) => {
      await ReadonlyToken.allow();

      expect(relayer.generateKeypair).not.toHaveBeenCalled();
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    it("instance allow() delegates to sdk.allow", async ({ readonlyToken, relayer, signer }) => {
      await readonlyToken.allow();

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("allows credentials for all tokens in a single signature", async ({
      sdk,
      relayer,
      signer,
      tokenAddress,
    }) => {
      const token1 = new ReadonlyToken(sdk, tokenAddress);
      const token2 = new ReadonlyToken(sdk, TOKEN2);

      await ReadonlyToken.allow(token1, token2);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });
  });

  describe("isAllowed", () => {
    it("returns false before allow()", async ({ readonlyToken }) => {
      expect(await readonlyToken.isAllowed()).toBe(false);
    });

    it("returns true after allow()", async ({ readonlyToken }) => {
      await readonlyToken.allow();
      expect(await readonlyToken.isAllowed()).toBe(true);
    });
  });

  describe("revoke", () => {
    it("clears the session so isAllowed returns false", async ({ readonlyToken, tokenAddress }) => {
      await readonlyToken.allow();
      expect(await readonlyToken.isAllowed()).toBe(true);

      await readonlyToken.revoke(tokenAddress);
      expect(await readonlyToken.isAllowed()).toBe(false);
    });
  });
});

describe("ZamaSDK token factory", () => {
  it("creates ReadonlyToken with correct address and SDK reference", ({ sdk, tokenAddress }) => {
    const token = new ReadonlyToken(sdk, tokenAddress);

    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("throws when handle not found in decrypt result", async ({
    sdk,
    tokenAddress,
    handle,
    provider,
  }) => {
    const token = new ReadonlyToken(sdk, tokenAddress);
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(sdk.relayer.userDecrypt).mockResolvedValue({});

    await expect(token.balanceOf(OWNER)).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});
