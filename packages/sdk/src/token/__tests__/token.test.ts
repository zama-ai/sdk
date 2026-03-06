import { Topics } from "../../events";
import { Token } from "../token";
import type { Address } from "../token.types";
import { ZamaError, ZamaErrorCode } from "../token.types";
import { describe, expect, it, vi } from "../../test-fixtures";

const ZERO_HANDLE = "0x" + "0".repeat(64);

describe("Token", () => {
  describe("balanceOf", () => {
    it("returns 0n for zero handle without decrypting", async ({ signer, relayer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      const balance = await token.balanceOf();

      expect(balance).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);

      const balance = await token.balanceOf();

      expect(balance).toBe(1000n);
      expect(relayer.generateKeypair).toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalled();
      expect(relayer.userDecrypt).toHaveBeenCalled();
    });

    it("defaults owner to signer address", async ({ signer, userAddress, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      await token.balanceOf();

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialBalanceOf",
          args: [userAddress],
        }),
      );
    });

    it("accepts custom owner address", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
      const otherAddress = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

      await token.balanceOf(otherAddress);

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [otherAddress] }),
      );
    });
  });

  describe("confidentialBalanceOf", () => {
    it("returns the raw handle without decrypting", async ({ relayer, signer, token, handle }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);

      const result = await token.confidentialBalanceOf();

      expect(result).toBe(handle);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });
  });

  describe("isConfidential", () => {
    it("returns true when ERC-165 check passes", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(true);

      expect(await token.isConfidential()).toBe(true);
    });

    it("returns false when ERC-165 check fails", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(false);

      expect(await token.isConfidential()).toBe(false);
    });
  });

  describe("isWrapper", () => {
    it("returns true when ERC-165 wrapper check passes", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(true);

      expect(await token.isWrapper()).toBe(true);
    });
  });

  describe("batchDecryptBalances", () => {
    const TOKEN2 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const handle2 = "0x" + "cd".repeat(32);

    it("returns empty map for empty array", async () => {
      const result = await Token.batchDecryptBalances([]);
      expect(result.size).toBe(0);
    });

    it("decrypts pre-read handles without calling readContract", async ({
      relayer,
      signer,
      token,
      handle,
      tokenAddress,
      createToken,
      storage,
      sessionStorage,
    }) => {
      const token2 = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockResolvedValueOnce({ [handle2]: 2000n });

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle as Address, handle2 as Address],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(2000n);
      expect(signer.readContract).not.toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("skips decryption for zero handles", async ({
      relayer,
      signer,
      token,
      handle,
      tokenAddress,
      createToken,
      storage,
      sessionStorage,
    }) => {
      const token2 = createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: TOKEN2,
      });

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [handle as Address, ZERO_HANDLE as Address],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(0n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    });

    it("returns 0n for tokens that fail decryption when onError returns 0n", async ({
      relayer,

      token,
      handle,
      tokenAddress,
    }) => {
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      const result = await Token.batchDecryptBalances([token], {
        handles: [handle as Address],
        onError: () => 0n,
      });

      expect(result.get(tokenAddress)).toBe(0n);
    });

    it("throws DecryptionFailedError by default when decryption fails", async ({
      relayer,

      token,
      handle,
    }) => {
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(
        Token.batchDecryptBalances([token], {
          handles: [handle as Address],
        }),
      ).rejects.toThrow("Batch decryption failed for 1 token(s)");
    });
  });

  describe("decryptBalance", () => {
    it("returns 0n for zero handle without decrypting", async ({
      relayer,

      token,
    }) => {
      const balance = await token.decryptBalance(ZERO_HANDLE as Address);

      expect(balance).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("returns 0n for 0x handle without decrypting", async ({
      relayer,

      token,
    }) => {
      const balance = await token.decryptBalance("0x" as Address);

      expect(balance).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async ({
      relayer,

      token,
      handle,
      tokenAddress,
    }) => {
      const balance = await token.decryptBalance(handle as Address);

      expect(balance).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [handle],
          contractAddress: tokenAddress,
        }),
      );
    });

    it("does not call readContract (skips on-chain read)", async ({ signer, token, handle }) => {
      await token.decryptBalance(handle as Address);

      expect(signer.readContract).not.toHaveBeenCalled();
    });

    it("uses provided owner as signerAddress", async ({
      relayer,

      token,
      handle,
    }) => {
      const otherOwner = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      await token.decryptBalance(handle as Address, otherOwner);

      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: otherOwner,
        }),
      );
    });

    it("defaults signerAddress to signer.getAddress()", async ({
      relayer,

      userAddress,
      token,
      handle,
    }) => {
      await token.decryptBalance(handle as Address);

      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: userAddress,
        }),
      );
    });

    it("throws ZamaError on decryption failure", async ({
      relayer,

      token,
      handle,
    }) => {
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(token.decryptBalance(handle as Address)).rejects.toThrow(
        "Failed to decrypt balance",
      );
    });

    it("returns 0n when handle not found in decrypt result", async ({
      relayer,

      token,
      handle,
    }) => {
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({});

      const balance = await token.decryptBalance(handle as Address);

      expect(balance).toBe(0n);
    });
  });

  describe("isZeroHandle", () => {
    it("returns true for zero handle", ({ token }) => {
      expect(token.isZeroHandle(ZERO_HANDLE)).toBe(true);
    });

    it("returns true for 0x", ({ token }) => {
      expect(token.isZeroHandle("0x")).toBe(true);
    });

    it("returns false for valid handle", ({ token, handle }) => {
      expect(token.isZeroHandle(handle)).toBe(false);
    });
  });

  describe("discoverWrapper", () => {
    const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
    const WRAPPER_ADDR = "0xdiscoveredWrapper" as Address;

    it("returns wrapper address when it exists", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(true) // wrapperExists
        .mockResolvedValueOnce(WRAPPER_ADDR); // getWrapper

      const result = await token.discoverWrapper(COORDINATOR);

      expect(result).toBe(WRAPPER_ADDR);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrapperExists" }),
      );
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getWrapper" }),
      );
    });

    it("returns null when wrapper does not exist", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(false);

      const result = await token.discoverWrapper(COORDINATOR);

      expect(result).toBeNull();
      expect(signer.readContract).toHaveBeenCalledOnce();
    });
  });

  describe("underlyingToken", () => {
    it("reads the underlying token address", async ({ signer, token }) => {
      const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;
      vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING);

      const result = await token.underlyingToken();

      expect(result).toBe(UNDERLYING);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "underlying" }),
      );
    });
  });

  describe("name", () => {
    it("reads the token name", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce("My Token");

      const result = await token.name();

      expect(result).toBe("My Token");
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "name" }),
      );
    });
  });

  describe("symbol", () => {
    it("reads the token symbol", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce("MTK");

      const result = await token.symbol();

      expect(result).toBe("MTK");
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "symbol" }),
      );
    });
  });

  describe("decimals", () => {
    it("reads the token decimals", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(18);

      const result = await token.decimals();

      expect(result).toBe(18);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "decimals" }),
      );
    });
  });

  describe("allow", () => {
    it("generates credentials without reading balance", async ({ relayer, signer, token }) => {
      await token.allow();

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
      expect(signer.readContract).not.toHaveBeenCalled();
    });
  });

  describe("confidentialTransfer", () => {
    it("encrypts amount and sends transaction", async ({
      relayer,
      signer,
      userAddress,
      token,
      tokenAddress,
    }) => {
      const result = await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
      );

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 100n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransfer",
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("shield", () => {
    it("checks allowance and shields", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      const txHash = await token.shield(100n);

      // approve + wrap = 2 writeContract calls
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "approve" }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "wrap" }),
      );
      expect(txHash.txHash).toBe("0xtxhash");
      expect(txHash.receipt).toEqual({ logs: [] });
    });

    it("skips approval when allowance is sufficient", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(200n); // enough allowance

      await token.shield(100n);

      // Only wrap, no approve
      expect(signer.writeContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("skips approval when approvalStrategy is skip", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // #getUnderlying

      await token.shield(100n, { approvalStrategy: "skip" });

      // Only readContract for #getUnderlying, no allowance check
      expect(signer.readContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });
  });

  describe("shieldETH", () => {
    it("sends shieldETH with value", async ({ signer, token }) => {
      const result = await token.shieldETH(1000n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 1000n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrap", () => {
    it("encrypts amount and sends unwrap to userAddress address", async ({
      relayer,
      signer,
      userAddress,
      token,
      tokenAddress,
    }) => {
      const result = await token.unwrap(50n);

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 50n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          args: expect.arrayContaining([userAddress, userAddress]),
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrapAll", () => {
    it("uses existing balance handle and sends to userAddress address", async ({
      relayer,
      signer,
      userAddress,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);

      await token.unwrapAll();

      expect(relayer.encrypt).not.toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          args: [userAddress, userAddress, handle],
        }),
      );
    });

    it("throws when balance is zero", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      await expect(token.unwrapAll()).rejects.toThrow("balance is zero");
    });
  });

  describe("finalizeUnwrap", () => {
    it("decrypts burn amount and finalizes", async ({ relayer, signer, token }) => {
      const burnHandle = "0xburn" as Address;
      const result = await token.finalizeUnwrap(burnHandle);

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([burnHandle]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unshield", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

    it("orchestrates unwrap → receipt → finalizeUnwrap", async ({
      relayer,
      signer,
      userAddress,
      token,
    }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + userAddress.slice(2)],
            data: "0x" + "ff".repeat(32),
          },
        ],
      });

      const result = await token.unshield(50n);

      expect(relayer.encrypt).toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xtxhash");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toBeDefined();
    });

    it("throws when no UnwrapRequested event in receipt", async ({ signer, token }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [],
      });

      await expect(token.unshield(50n)).rejects.toThrow(
        "No UnwrapRequested event found in unshield receipt",
      );
    });

    it("re-throws ZamaError from waitForTransactionReceipt as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      // First call succeeds (unwrap), second call fails (waitAndFinalize)
      vi.mocked(signer.waitForTransactionReceipt)
        .mockResolvedValueOnce({ logs: [] }) // unwrap receipt (no event triggers error in another path)
        .mockRejectedValueOnce(original);

      // Need the unwrap to succeed and produce a receipt with the event
      vi.mocked(signer.waitForTransactionReceipt).mockReset();
      vi.mocked(signer.waitForTransactionReceipt).mockRejectedValueOnce(original);

      await expect(token.unshield(50n)).rejects.toBe(original);
    });

    it("wraps non-ZamaError from waitForTransactionReceipt in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockRejectedValueOnce(new Error("timeout"));

      await expect(token.unshield(50n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
      });
    });
  });

  describe("unshieldAll", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

    it("orchestrates unwrapAll → receipt → finalizeUnwrap", async ({
      relayer,
      signer,
      userAddress,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + userAddress.slice(2)],
            data: "0x" + "ff".repeat(32),
          },
        ],
      });

      const result = await token.unshieldAll();

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xtxhash");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toBeDefined();
    });

    it("throws when no UnwrapRequested event in receipt", async ({ signer, token, handle }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [],
      });

      await expect(token.unshieldAll()).rejects.toThrow(
        "No UnwrapRequested event found in unshield receipt",
      );
    });
  });

  // ── Additional coverage ──────────────────────────────────────────────

  describe("confidentialTransfer (error handling)", () => {
    it("wraps non-ZamaError in EncryptionFailed", async ({ relayer, token }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt transfer amount"
        );
      });
    });

    it("re-throws ZamaError from encrypt as-is", async ({ relayer, token }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toBe(original);
    });

    it("throws EncryptionFailed when encrypt returns empty handles", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({
        handles: [],
        inputProof: new Uint8Array([4, 5, 6]),
      });

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no handles",
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "Transfer transaction failed",
      });
    });
  });

  describe("confidentialTransferFrom", () => {
    it("encrypts amount with from as userAddress and sends transaction", async ({
      relayer,
      signer,
      token,
      tokenAddress,
    }) => {
      const from = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
      const to = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

      const result = await token.confidentialTransferFrom(from, to, 200n);

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 200n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: from,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransferFrom",
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("wraps non-ZamaError in EncryptionFailed", async ({ relayer, token }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt transferFrom amount"
        );
      });
    });

    it("re-throws ZamaError from encrypt as-is", async ({ relayer, token }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toBe(original);
    });

    it("throws EncryptionFailed when encrypt returns empty handles", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({
        handles: [],
        inputProof: new Uint8Array([4, 5, 6]),
      });

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no handles",
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "TransferFrom transaction failed",
      });
    });
  });

  describe("approve", () => {
    it("calls setOperatorContract with spender", async ({ signer, token }) => {
      const spender = "0x3333333333333333333333333333333333333333" as Address;

      const result = await token.approve(spender);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "setOperator",
          args: expect.arrayContaining([spender]),
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("wraps error in ApprovalFailed", async ({ signer, token }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.approve("0x3333333333333333333333333333333333333333" as Address),
      ).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.ApprovalFailed &&
          err.message === "Operator approval failed"
        );
      });
    });
  });

  describe("isApproved", () => {
    it("returns boolean result from readContract", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(true);

      const result = await token.isApproved(
        "0x3333333333333333333333333333333333333333" as Address,
      );

      expect(result).toBe(true);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "isOperator",
        }),
      );
    });
  });

  describe("wrap (additional branches)", () => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

    it("calls shieldETH when underlying is zero address", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_ADDRESS); // #getUnderlying

      const result = await token.shield(100n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 100n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("passes amount + fees as value when underlying is zero address with fees", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_ADDRESS); // #getUnderlying

      await token.shield(100n, { fees: 10n });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 110n,
        }),
      );
    });

    it("approves max uint256 with approvalStrategy max", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      await token.shield(100n, { approvalStrategy: "max" });

      // First writeContract call is approve with max uint256
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("resets to zero first when existing non-zero allowance (USDT handling)", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(50n); // existing non-zero allowance < amount

      await token.shield(100n);

      // reset to zero, then approve exact, then wrap = 3 calls
      expect(signer.writeContract).toHaveBeenCalledTimes(3);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([0n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([100n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("wraps write failure in TransactionReverted", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // #getUnderlying
      // skip approval
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toSatisfy(
        (err: ZamaError) => {
          return (
            err instanceof ZamaError &&
            err.code === ZamaErrorCode.TransactionReverted &&
            err.message === "Shield transaction failed"
          );
        },
      );
    });

    it("wraps allowance check failure in ApprovalFailed", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("approve failed"));

      await expect(token.shield(100n)).rejects.toSatisfy((err: ZamaError) => {
        return err instanceof ZamaError && err.code === ZamaErrorCode.ApprovalFailed;
      });
    });
  });

  describe("shieldETH (error wrapping)", () => {
    it("wraps ZamaError thrown by writeContract", async ({ signer, token }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.shieldETH(1000n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "Shield ETH transaction failed",
      });
    });

    it("re-throws ZamaError as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.shieldETH(1000n)).rejects.toBe(original);
    });
  });

  describe("shieldETH (additional branches)", () => {
    it("uses custom value parameter when provided", async ({ signer, token }) => {
      const result = await token.shieldETH(1000n, 2000n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 2000n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrap (error handling)", () => {
    it("wraps encrypt failure in EncryptionFailed", async ({ relayer, token }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("encrypt failed"));

      await expect(token.unwrap(50n)).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt unshield amount"
        );
      });
    });

    it("re-throws ZamaError from encrypt as-is", async ({ relayer, token }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(token.unwrap(50n)).rejects.toBe(original);
    });

    it("throws EncryptionFailed when encrypt returns empty handles", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({
        handles: [],
        inputProof: new Uint8Array([4, 5, 6]),
      });

      await expect(token.unwrap(50n)).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no handles",
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.unwrap(50n)).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.unwrap(50n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "Unshield transaction failed",
      });
    });
  });

  describe("unwrapAll (error handling)", () => {
    it("wraps write failure in TransactionReverted", async ({ signer, token, handle }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.unwrapAll()).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.TransactionReverted &&
          err.message === "Unshield-all transaction failed"
        );
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token, handle }) => {
      vi.mocked(signer.readContract).mockResolvedValue(handle);
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.unwrapAll()).rejects.toBe(original);
    });
  });

  describe("finalizeUnwrap (error handling)", () => {
    it("wraps publicDecrypt failure in DecryptionFailed", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toSatisfy(
        (err: ZamaError) => {
          return (
            err instanceof ZamaError &&
            err.code === ZamaErrorCode.DecryptionFailed &&
            err.message === "Failed to finalize unshield"
          );
        },
      );
    });

    it("re-throws ZamaError from publicDecrypt as-is", async ({
      relayer,

      token,
    }) => {
      const original = new ZamaError(ZamaErrorCode.DecryptionFailed, "already wrapped");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toBe(original);
    });

    it("throws DecryptionFailed when abiEncodedClearValues is not a valid BigInt", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.publicDecrypt).mockResolvedValueOnce({
        clearValues: {},
        abiEncodedClearValues: "not-a-number" as never,
        decryptionProof: "0x12",
      });

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
        message: expect.stringContaining("Cannot parse decrypted value"),
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "Failed to finalize unshield",
      });
    });
  });

  describe("approveUnderlying", () => {
    it("defaults to max uint256 approval", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("resets to zero first when existing non-zero allowance", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(50n); // currentAllowance > 0

      await token.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([0n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("accepts custom amount", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying(500n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([500n]),
        }),
      );
    });

    it("wraps error in ApprovalFailed", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("approve failed"));

      await expect(token.approveUnderlying()).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.ApprovalFailed &&
          err.message === "ERC-20 approval failed"
        );
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.approveUnderlying()).rejects.toBe(original);
    });

    it("skips allowance check when amount is 0n", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // underlying

      await token.approveUnderlying(0n);

      // Only readContract for underlying, no allowance check (approvalAmount is 0)
      expect(signer.readContract).toHaveBeenCalledOnce();
    });
  });

  describe("approve (ZamaError re-throw)", () => {
    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.approve("0x3333333333333333333333333333333333333333" as Address),
      ).rejects.toBe(original);
    });
  });

  describe("shield (ZamaError re-throw from ensureAllowance)", () => {
    it("re-throws ZamaError from approve in ensureAllowance as-is", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying
        .mockResolvedValueOnce(0n); // allowance

      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.shield(100n)).rejects.toBe(original);
    });

    it("re-throws ZamaError from wrap writeContract as-is", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // #getUnderlying

      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toBe(original);
    });
  });

  describe("resumeUnshield", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

    it("resumes from an existing unwrap tx hash", async ({
      relayer,
      signer,
      userAddress,
      token,
    }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + userAddress.slice(2)],
            data: "0x" + "ff".repeat(32),
          },
        ],
      });

      const result = await token.resumeUnshield("0xprevioustx" as `0x${string}`);

      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
    });
  });
});
