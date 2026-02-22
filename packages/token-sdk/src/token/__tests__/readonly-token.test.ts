import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReadonlyToken } from "../readonly-token";
import { ZERO_HANDLE } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
import type { GenericSigner } from "../token.types";
import { TokenErrorCode } from "../token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Hex } from "../../relayer/relayer-sdk.types";

const TOKEN = "0xtoken" as Hex;
const USER = "0xuser" as Hex;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Hex;
const VALID_HANDLE2 = ("0x" + "cd".repeat(32)) as Hex;

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
  };
}

describe("ReadonlyToken", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let token: ReadonlyToken;

  beforeEach(() => {
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
      const result = await token.decryptHandles([ZERO_HANDLE as Hex]);

      expect(result.get(ZERO_HANDLE)).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("returns 0n for 0x handle without hitting relayer", async () => {
      const result = await token.decryptHandles(["0x" as Hex]);

      expect(result.get("0x")).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handles in a single relayer call", async () => {
      const result = await token.decryptHandles([VALID_HANDLE as Hex, VALID_HANDLE2 as Hex]);

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
      const result = await token.decryptHandles([ZERO_HANDLE as Hex, VALID_HANDLE as Hex]);

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
      const otherOwner = "0xother" as Hex;
      await token.decryptHandles([VALID_HANDLE as Hex], otherOwner);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: otherOwner,
        }),
      );
    });

    it("defaults signerAddress to signer.getAddress()", async () => {
      await token.decryptHandles([VALID_HANDLE as Hex]);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: USER,
        }),
      );
    });

    it("returns 0n for handles not in decrypt result", async () => {
      const unknownHandle = ("0x" + "ff".repeat(32)) as Hex;
      vi.mocked(sdk.userDecrypt).mockResolvedValueOnce({});

      const result = await token.decryptHandles([unknownHandle as Hex]);

      expect(result.get(unknownHandle)).toBe(0n);
    });

    it("throws TokenError on decryption failure", async () => {
      vi.mocked(sdk.userDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(token.decryptHandles([VALID_HANDLE as Hex])).rejects.toMatchObject({
        code: TokenErrorCode.DecryptionFailed,
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
      const UNDERLYING = "0xunderlying" as Hex;
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(UNDERLYING) // underlying()
        .mockResolvedValueOnce(500n); // allowance()

      const result = await token.allowance("0xwrapper" as Hex);

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
});

describe("TokenSDK token factory", () => {
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
