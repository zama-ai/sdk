import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReadonlyToken } from "../readonly-token";
import { ZERO_HANDLE } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
import type { GenericSigner } from "../token.types";
import { ZamaErrorCode } from "../token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { DecryptionFailedError } from "../errors";
import { CredentialsManager } from "../credential-manager";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;
const VALID_HANDLE2 = ("0x" + "cd".repeat(32)) as Address;

function createMockSdk() {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE]: 1000n,
      [VALID_HANDLE2]: 2000n,
    }),
  } as unknown as RelayerSDK;
}

function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(USER),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn().mockResolvedValue(ZERO_HANDLE),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

describe("ReadonlyToken", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let token: ReadonlyToken;

  beforeEach(() => {
    CredentialsManager.clearSessionSignatures();
    sdk = createMockSdk();
    signer = createMockSigner();
    token = new ReadonlyToken({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
    });
  });

  describe("decryptHandles", () => {
    it("returns 0n for zero handles without hitting relayer", async () => {
      const result = await token.decryptHandles([ZERO_HANDLE as Address]);

      expect(result.get(ZERO_HANDLE)).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("returns 0n for 0x handle without hitting relayer", async () => {
      const result = await token.decryptHandles(["0x" as Address]);

      expect(result.get("0x")).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handles in a single relayer call", async () => {
      const result = await token.decryptHandles([
        VALID_HANDLE as Address,
        VALID_HANDLE2 as Address,
      ]);

      expect(result.get(VALID_HANDLE)).toBe(1000n);
      expect(result.get(VALID_HANDLE2)).toBe(2000n);
      expect(sdk.userDecrypt).toHaveBeenCalledOnce();
      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [VALID_HANDLE, VALID_HANDLE2],
          contractAddress: TOKEN,
        }),
      );
    });

    it("mixes zero and non-zero handles correctly", async () => {
      const result = await token.decryptHandles([ZERO_HANDLE as Address, VALID_HANDLE as Address]);

      expect(result.get(ZERO_HANDLE)).toBe(0n);
      expect(result.get(VALID_HANDLE)).toBe(1000n);
      expect(sdk.userDecrypt).toHaveBeenCalledOnce();
      // Only the non-zero handle should be sent to relayer
      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [VALID_HANDLE],
        }),
      );
    });

    it("returns empty map for empty input", async () => {
      const result = await token.decryptHandles([]);

      expect(result.size).toBe(0);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("uses provided owner as signerAddress", async () => {
      const otherOwner = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      await token.decryptHandles([VALID_HANDLE as Address], otherOwner);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: otherOwner,
        }),
      );
    });

    it("defaults signerAddress to signer.getAddress()", async () => {
      await token.decryptHandles([VALID_HANDLE as Address]);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: USER,
        }),
      );
    });

    it("returns 0n for handles not in decrypt result", async () => {
      const unknownHandle = ("0x" + "ff".repeat(32)) as Address;
      vi.mocked(sdk.userDecrypt).mockResolvedValueOnce({});

      const result = await token.decryptHandles([unknownHandle as Address]);

      expect(result.get(unknownHandle)).toBe(0n);
    });

    it("throws ZamaError on decryption failure", async () => {
      vi.mocked(sdk.userDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(token.decryptHandles([VALID_HANDLE as Address])).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
        message: "Failed to decrypt handles",
      });
    });
  });

  describe("normalizeHandle", () => {
    it("returns hex string as-is", async () => {
      // normalizeHandle is protected, test via confidentialBalanceOf
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      await expect(token.confidentialBalanceOf()).resolves.toBe(VALID_HANDLE);
    });

    it("converts bigint to padded hex", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(255n);
      const handle = await token.confidentialBalanceOf();
      expect(handle).toBe("0x" + "ff".padStart(64, "0"));
    });

    it("returns ZERO_HANDLE for unknown types", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(true);
      const handle = await token.confidentialBalanceOf();
      expect(handle).toBe(ZERO_HANDLE);
    });
  });

  describe("allowance", () => {
    it("reads underlying token then checks allowance", async () => {
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

    it("throws DecryptionFailedError by default when decryption fails", async () => {
      const token2 = new ReadonlyToken({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      vi.mocked(sdk.userDecrypt)
        .mockResolvedValueOnce({ [VALID_HANDLE]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        ReadonlyToken.batchDecryptBalances([token, token2], {
          handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(DecryptionFailedError);

      // Reset mocks for second assertion — token's result is now cached,
      // so only token2 will call userDecrypt.
      vi.mocked(sdk.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        ReadonlyToken.batchDecryptBalances([token, token2], {
          handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(/Batch decryption failed for 1 token\(s\)/);
    });

    it("returns fallback from onError callback instead of throwing", async () => {
      const token2 = new ReadonlyToken({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      vi.mocked(sdk.userDecrypt)
        .mockResolvedValueOnce({ [VALID_HANDLE]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const result = await ReadonlyToken.batchDecryptBalances([token, token2], {
        handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
        onError: () => 0n,
      });

      expect(result.get(TOKEN)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(0n);
    });

    it("onError receives correct error and address", async () => {
      const token2 = new ReadonlyToken({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      vi.mocked(sdk.userDecrypt)
        .mockResolvedValueOnce({ [VALID_HANDLE]: 1000n })
        .mockRejectedValueOnce(new Error("decrypt failed"));

      const captured: Array<{ error: Error; address: Address }> = [];
      const result = await ReadonlyToken.batchDecryptBalances([token, token2], {
        handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
        onError: (error, address) => {
          captured.push({ error, address });
          return 42n;
        },
      });

      expect(result.get(TOKEN)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(42n);
      expect(captured).toHaveLength(1);
      expect(captured[0]!.address).toBe(TOKEN2);
      expect(captured[0]!.error.message).toBe("decrypt failed");
    });
  });

  describe("batchDecryptBalances (length mismatch)", () => {
    it("throws DecryptionFailedError when tokens and handles have different lengths", async () => {
      await expect(
        ReadonlyToken.batchDecryptBalances([token], {
          handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
        }),
      ).rejects.toThrow(/tokens\.length.*must equal.*handles\.length/);
    });
  });

  describe("allow", () => {
    it("returns immediately when called with no tokens", async () => {
      await ReadonlyToken.allow();

      expect(sdk.generateKeypair).not.toHaveBeenCalled();
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    it("instance allow() delegates to credentials manager", async () => {
      await token.allow();

      expect(sdk.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("allows credentials for all tokens in a single signature", async () => {
      const TOKEN2 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
      const token2 = new ReadonlyToken({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      await ReadonlyToken.allow(token, token2);

      expect(sdk.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });
  });

  describe("isAllowed", () => {
    it("returns false before allow()", async () => {
      expect(await token.isAllowed()).toBe(false);
    });

    it("returns true after allow()", async () => {
      await token.allow();
      expect(await token.isAllowed()).toBe(true);
    });
  });

  describe("revoke", () => {
    it("clears the session so isAllowed returns false", async () => {
      await token.allow();
      expect(await token.isAllowed()).toBe(true);

      await token.revoke();
      expect(await token.isAllowed()).toBe(false);
    });
  });
});

describe("ZamaSDK token factory", () => {
  it("creates ReadonlyToken with correct address", () => {
    const sdk = createMockSdk();
    const signer = createMockSigner();
    const token = new ReadonlyToken({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
    });

    expect(token.address).toBe(TOKEN);
    expect(token.signer).toBe(signer);
  });
});
