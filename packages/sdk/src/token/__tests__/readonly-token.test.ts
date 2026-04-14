import { describe, it, expect, vi } from "../../test-fixtures";
import { ZERO_HANDLE } from "../readonly-token";
import { Token } from "../token";
import { DecryptCache } from "../../decrypt-cache";
import { ZamaErrorCode, DecryptionFailedError } from "../../errors";
import type { GenericSigner, GenericStorage } from "../../types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { getAddress, type Address } from "viem";

const VALID_HANDLE2 = ("0x" + "cd".repeat(32)) as Address;

interface TokenContext {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  tokenAddress: Address;
  handle: Address;
  cache?: DecryptCache;
}

function createToken({
  relayer,
  signer,
  storage,
  sessionStorage,
  tokenAddress,
  handle,
  cache,
}: TokenContext): Token {
  vi.mocked(relayer.userDecrypt).mockResolvedValue({
    [handle]: 1000n,
    [VALID_HANDLE2]: 2000n,
  } as never);
  return new Token({
    relayer,
    signer,
    storage,
    sessionStorage,
    address: tokenAddress,
    cache,
  });
}

describe("Token", () => {
  describe("decryptHandles", () => {
    it("returns 0n for zero handles without hitting relayer", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createToken({
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
      const token = createToken({
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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([handle, VALID_HANDLE2]);

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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const result = await token.decryptHandles([ZERO_HANDLE as Address, handle]);

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
      const token = createToken({
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

    it("defaults signerAddress to signer.getAddress()", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
      userAddress,
    }) => {
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await token.decryptHandles([handle]);

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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const unknownHandle = ("0x" + "ff".repeat(32)) as Address;
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({});

      await expect(token.decryptHandles([unknownHandle as Address])).rejects.toThrow(
        "Decryption returned no value for handle",
      );
    });

    it("throws ZamaError on decryption failure", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(token.decryptHandles([handle])).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
        message: "Failed to decrypt handles",
      });
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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(UNDERLYING) // underlying()
        .mockResolvedValueOnce(500n); // allowance()

      const result = await token.allowance("0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address);

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
    const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

    it("throws DecryptionFailedError by default when decryption fails", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new Token({
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
        Token.batchDecryptBalances([token, token2], {
          handles: [handle, VALID_HANDLE2],
        }),
      ).rejects.toThrow(DecryptionFailedError);

      // Reset mocks for second assertion — token's result is now cached,
      // so only token2 will call userDecrypt.
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        Token.batchDecryptBalances([token, token2], {
          handles: [handle, VALID_HANDLE2],
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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new Token({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle, VALID_HANDLE2],
        onError: () => 0n,
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(0n);
    });

    it("onError receives correct error and address", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
    }) => {
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const token2 = new Token({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const captured: { error: Error; address: Address }[] = [];
      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle, VALID_HANDLE2],
        onError: (error, address) => {
          captured.push({ error, address });
          return 42n;
        },
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(42n);
      expect(captured).toHaveLength(1);
      expect(captured[0].address).toBe(getAddress(TOKEN2));
      expect(captured[0].error.message).toBe("decrypt failed");
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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      await expect(
        Token.batchDecryptBalances([token], {
          handles: [handle, VALID_HANDLE2],
        }),
      ).rejects.toThrow(/tokens\.length.*must equal.*handles\.length/);
    });
  });

  describe("batchDecryptBalances (cache-aware allow)", () => {
    const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

    it("skips allow() entirely when all balances are cached", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
      userAddress,
    }) => {
      // Shared cache so both tokens see each other's entries.
      const sharedCache = new DecryptCache(storage);
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
        cache: sharedCache,
      });
      const token2 = new Token({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
        cache: sharedCache,
      });

      // Pre-populate cache for both tokens (requester = signer, contractAddress = token address)
      await sharedCache.set(userAddress, tokenAddress, handle, 1000n);
      await sharedCache.set(userAddress, getAddress(TOKEN2), VALID_HANDLE2, 2000n);

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle, VALID_HANDLE2],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(2000n);
      // No credentials needed — no keypair generation or signing
      expect(relayer.generateKeypair).not.toHaveBeenCalled();
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    it("calls allow() only with uncached token addresses", async ({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
      handle,
      userAddress,
    }) => {
      const sharedCache = new DecryptCache(storage);
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
        cache: sharedCache,
      });
      const token2 = new Token({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
        cache: sharedCache,
      });

      // Pre-populate cache only for token1
      await sharedCache.set(userAddress, tokenAddress, handle, 1000n);

      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [VALID_HANDLE2]: 2000n,
      } as never);

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle, VALID_HANDLE2],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(2000n);
      // Credentials generated only for the uncached token
      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
      // createEIP712 called with only token2's address
      const eip712Call = vi.mocked(relayer.createEIP712).mock.calls[0];
      const signedAddresses = eip712Call[1];
      expect(signedAddresses).toHaveLength(1);
      expect(signedAddresses[0].toLowerCase()).toBe(TOKEN2.toLowerCase());
    });
  });

  describe("allow", () => {
    it("returns immediately when called with no tokens", async ({ relayer, signer }) => {
      await Token.allow();

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
      const token = createToken({
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
      const token = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
        handle,
      });
      const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
      const token2 = new Token({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      await Token.allow(token, token2);

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
      const token = createToken({
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
      const token = createToken({
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
      const token = createToken({
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
  it("creates Token with correct address", ({
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
    });

    expect(token.address).toBe(tokenAddress);
    expect(token.signer).toBe(signer);
  });
});
