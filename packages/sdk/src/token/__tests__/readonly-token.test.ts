import { describe, it, expect, vi } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { ZERO_HANDLE } from "../readonly-token";
import { ZamaErrorCode } from "../token.types";
import type { GenericSigner, GenericStorage } from "../token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { DecryptionFailedError } from "../errors";

const VALID_HANDLE2 = ("0x" + "cd".repeat(32)) as Address;

interface ReadonlyTokenContext {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  tokenAddress: Address;
  handle: Address;
}

function createReadonlyToken({
  relayer,
  signer,
  storage,
  sessionStorage,
  tokenAddress,
  handle,
}: ReadonlyTokenContext): ReadonlyToken {
  vi.mocked(relayer.userDecrypt).mockResolvedValue({
    [handle]: 1000n,
    [VALID_HANDLE2]: 2000n,
  } as never);
  return new ReadonlyToken({
    relayer,
    signer,
    storage,
    sessionStorage,
    address: tokenAddress,
  });
}

describe("ReadonlyToken", () => {
  describe("decryptHandles", () => {
    it("returns 0n for zero handles without hitting relayer", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([ZERO_HANDLE as Address]);

      expect(result.get(ZERO_HANDLE)).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("returns 0n for 0x handle without hitting relayer", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles(["0x" as Address]);

      expect(result.get("0x")).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handles in a single relayer call", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([handle as Address, VALID_HANDLE2 as Address]);

      expect(result.get(handle)).toBe(1000n);
      expect(result.get(VALID_HANDLE2)).toBe(2000n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [handle, VALID_HANDLE2],
          contractAddress: tokenAddress,
        }),
      );
    });

    it("mixes zero and non-zero handles correctly", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([ZERO_HANDLE as Address, handle as Address]);

      expect(result.get(ZERO_HANDLE)).toBe(0n);
      expect(result.get(handle)).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
      // Only the non-zero handle should be sent to relayer
      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [handle],
        }),
      );
    });

    it("returns empty map for empty input", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([]);

      expect(result.size).toBe(0);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("uses provided owner as signerAddress", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const otherOwner = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      await token.decryptHandles([handle as Address], otherOwner);

      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: otherOwner,
        }),
      );
    });

    it("defaults signerAddress to signer.getAddress()", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
      userAddress,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await token.decryptHandles([handle as Address]);

      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: userAddress,
        }),
      );
    });

    it("returns 0n for handles not in decrypt result", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const unknownHandle = ("0x" + "ff".repeat(32)) as Address;
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({});

      const result = await token.decryptHandles([unknownHandle as Address]);

      expect(result.get(unknownHandle)).toBe(0n);
    });

    it("throws ZamaError on decryption failure", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(token.decryptHandles([handle as Address])).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
        message: "Failed to decrypt handles",
      });
    });
  });

  describe("normalizeHandle", () => {
    it("returns hex string as-is", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      // normalizeHandle is protected, test via confidentialBalanceOf
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      await expect(token.confidentialBalanceOf()).resolves.toBe(handle);
    });

    it("converts bigint to padded hex", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      vi.mocked(signer.readContract).mockResolvedValue(255n);
      const result = await token.confidentialBalanceOf();
      expect(result).toBe("0x" + "ff".padStart(64, "0"));
    });

    it("returns ZERO_HANDLE for unknown types", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      vi.mocked(signer.readContract).mockResolvedValue(true);
      const result = await token.confidentialBalanceOf();
      expect(result).toBe(ZERO_HANDLE);
    });
  });

  describe("allowance", () => {
    it("reads underlying token then checks allowance", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(UNDERLYING) // underlying()
        .mockResolvedValueOnce(500n); // allowance()

      const result = await token.allowance("0x4444444444444444444444444444444444444444" as Address);

      expect(result).toBe(500n);
      expect(signer.readContract).toHaveBeenCalledTimes(2);
      expect(signer.readContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "underlying" }),
      );
      expect(signer.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "allowance" }),
      );
    });
  });

  describe("batchDecryptBalances error paths", () => {
    const TOKEN2 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;

    it("throws DecryptionFailedError by default when decryption fails", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new ReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        ReadonlyToken.batchDecryptBalances([token, token2], {
          handles: [handle as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(DecryptionFailedError);

      // Reset mocks for second assertion — token's result is now cached,
      // so only token2 will call userDecrypt.
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        ReadonlyToken.batchDecryptBalances([token, token2], {
          handles: [handle as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(/Batch decryption failed for 1 token\(s\)/);
    });

    it("returns fallback from onError callback instead of throwing", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new ReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const result = await ReadonlyToken.batchDecryptBalances([token, token2], {
        handles: [handle as Address, VALID_HANDLE2 as Address],
        onError: () => 0n,
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(0n);
    });

    it("onError receives correct error and address", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new ReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const captured: Array<{ error: Error; address: Address }> = [];
      const result = await ReadonlyToken.batchDecryptBalances([token, token2], {
        handles: [handle as Address, VALID_HANDLE2 as Address],
        onError: (error, address) => {
          captured.push({ error, address });
          return 42n;
        },
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(42n);
      expect(captured).toHaveLength(1);
      expect(captured[0]!.address).toBe(TOKEN2);
      expect(captured[0]!.error.message).toBe("decrypt failed");
    });
  });

  describe("batchDecryptBalances (length mismatch)", () => {
    it("throws DecryptionFailedError when tokens and handles have different lengths", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await expect(
        ReadonlyToken.batchDecryptBalances([token], {
          handles: [handle as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(/tokens\.length.*must equal.*handles\.length/);
    });
  });

  describe("allow", () => {
    it("returns immediately when called with no tokens", async ({ relayer, signer }) => {
      await ReadonlyToken.allow();

      expect(relayer.generateKeypair).not.toHaveBeenCalled();
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    it("instance allow() delegates to credentials manager", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await token.allow();

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("allows credentials for all tokens in a single signature", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const TOKEN2 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const token2 = new ReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      await ReadonlyToken.allow(token, token2);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });
  });

  describe("isAllowed", () => {
    it("returns false before allow()", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      expect(await token.isAllowed()).toBe(false);
    });

    it("returns true after allow()", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await token.allow();
      expect(await token.isAllowed()).toBe(true);
    });
  });

  describe("revoke", () => {
    it("clears the session so isAllowed returns false", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createReadonlyToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await token.allow();
      expect(await token.isAllowed()).toBe(true);

      await token.revoke();
      expect(await token.isAllowed()).toBe(false);
    });
  });
});

describe("ZamaSDK token factory", () => {
  it("creates ReadonlyToken with correct address", ({
    relayer,
    signer,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    const token = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
    });

    expect(token.address).toBe(tokenAddress);
    expect(token.signer).toBe(signer);
  });
});
