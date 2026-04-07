import { Topics } from "../../events";
import { Token } from "../token";
import { getAddress, type Address } from "viem";
import { ZamaError, ZamaErrorCode } from "../../errors";
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
        expect.objectContaining({ args: [getAddress(otherAddress)] }),
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
    const TOKEN2 = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
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
        handles: [handle, handle2 as Address],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(2000n);
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
        handles: [handle, ZERO_HANDLE as Address],
      });

      expect(result.get(tokenAddress)).toBe(1000n);
      expect(result.get(getAddress(TOKEN2))).toBe(0n);
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
        handles: [handle],
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
          handles: [handle],
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
      const balance = await token.decryptBalance(handle);

      expect(balance).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [handle],
          contractAddress: tokenAddress,
        }),
      );
    });

    it("does not call readContract (skips on-chain read)", async ({ signer, token, handle }) => {
      await token.decryptBalance(handle);

      expect(signer.readContract).not.toHaveBeenCalled();
    });

    it("uses provided owner as signerAddress", async ({
      relayer,

      token,
      handle,
    }) => {
      const otherOwner = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      await token.decryptBalance(handle, otherOwner);

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
      await token.decryptBalance(handle);

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

      await expect(token.decryptBalance(handle)).rejects.toThrow("Failed to decrypt balance");
    });

    it("throws when handle not found in decrypt result", async ({
      relayer,

      token,
      handle,
    }) => {
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({});

      await expect(token.decryptBalance(handle as Address)).rejects.toThrow(
        "Decryption returned no value for handle",
      );
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

  describe("underlyingToken", () => {
    it("reads the underlying token address", async ({ signer, token }) => {
      const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
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
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
        .mockResolvedValueOnce(200n); // enough allowance

      await token.shield(100n);

      // Only wrap, no approve
      expect(signer.writeContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("skips approval when approvalStrategy is skip", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

      await token.shield(100n, { approvalStrategy: "skip" });

      // readContract for #getUnderlying + ERC-20 balanceOf, no allowance check
      expect(signer.readContract).toHaveBeenCalledTimes(2);
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
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.unshield(50n, { skipBalanceCheck: true });

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

      await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
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

      await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toBe(original);
    });

    it("wraps non-ZamaError from waitForTransactionReceipt in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockRejectedValueOnce(new Error("timeout"));

      await expect(token.unshield(50n, { skipBalanceCheck: true })).rejects.toMatchObject({
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
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
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
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
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
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
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
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no handles",
      });
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
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
      const to = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

      const result = await token.confidentialTransferFrom(from, to, 200n);

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 200n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: getAddress(from),
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
          "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
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
          "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
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
          "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
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
          "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
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
          "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
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
      const spender = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

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
        token.approve("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
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
        "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address,
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
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
        "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c",
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
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
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.approveUnderlying()).rejects.toBe(original);
    });

    it("skips allowance check when amount is 0n", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c",
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
        token.approve("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
      ).rejects.toBe(original);
    });
  });

  describe("shield (ZamaError re-throw from ensureAllowance)", () => {
    it("re-throws ZamaError from approve in ensureAllowance as-is", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
        .mockResolvedValueOnce(0n); // allowance

      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.shield(100n)).rejects.toBe(original);
    });

    it("re-throws ZamaError from wrap writeContract as-is", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

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
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.resumeUnshield("0xprevioustx" as `0x${string}`);

      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
    });
  });

  // ── Pre-flight balance validation (SDK-52) ─────────────────────────────

  describe("balance validation: confidentialTransfer", () => {
    const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when balance is zero handle", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE); // confidentialBalanceOf

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("throws BALANCE_CHECK_UNAVAILABLE when no credentials cached", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
      });
    });

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      // First, establish credentials by calling allow()
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 50n });

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("passes validation and submits transaction when balance is sufficient", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 200n });

      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes validation when balance exactly equals amount (boundary)", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("skipBalanceCheck: true bypasses validation", async ({ token }) => {
      const result = await token.confidentialTransfer(RECIPIENT, 100n, {
        skipBalanceCheck: true,
      });
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes callbacks alongside skipBalanceCheck", async ({ token }) => {
      const onEncryptComplete = vi.fn();
      const result = await token.confidentialTransfer(RECIPIENT, 100n, {
        skipBalanceCheck: true,
        onEncryptComplete,
      });
      expect(result.txHash).toBe("0xtxhash");
      expect(onEncryptComplete).toHaveBeenCalled();
    });

    it("allows zero-amount transfer when handle is zero", async ({ signer, token }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE); // confidentialBalanceOf

      const result = await token.confidentialTransfer(RECIPIENT, 0n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("re-throws ZamaError from decryptBalance (e.g. DecryptionFailedError)", async ({
      signer,
      token,
      handle,
      relayer,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new TypeError("network failure"));

      // decryptBalance wraps the TypeError as DecryptionFailedError (a ZamaError),
      // so #assertConfidentialBalance re-throws it as-is rather than wrapping again.
      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
      });
    });

    it("wraps non-ZamaError from decryptBalance as BALANCE_CHECK_UNAVAILABLE", async ({
      signer,
      token,
      handle,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      // Spy on decryptBalance to throw a raw (non-ZamaError) Error, bypassing
      // decryptBalance's own error wrapping.
      vi.spyOn(token, "decryptBalance").mockRejectedValueOnce(new Error("unexpected crash"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
        message: expect.stringContaining("could not decrypt confidential balance"),
      });
    });

    it("wraps readConfidentialBalanceOf failure as BALANCE_CHECK_UNAVAILABLE", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract).mockRejectedValueOnce(new Error("RPC unavailable"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
        message: expect.stringContaining("Could not read confidential balance handle"),
      });
    });

    it("uses cached plaintext balance (skips isAllowed / decrypt)", async ({
      signer,
      token,
      handle,
      storage,
    }) => {
      // Seed the decrypt cache with a sufficient balance
      const owner = getAddress(await signer.getAddress());
      const cacheKey = `zama:decrypt:${owner}:${getAddress(token.address)}:${handle.toLowerCase()}`;
      await storage.set(cacheKey, 200n);

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf

      // Should succeed without needing credentials (no allow() call)
      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("rejects from cache when cached balance is insufficient", async ({
      signer,
      token,
      handle,
      storage,
    }) => {
      const owner = getAddress(await signer.getAddress());
      const cacheKey = `zama:decrypt:${owner}:${getAddress(token.address)}:${handle.toLowerCase()}`;
      await storage.set(cacheKey, 50n);

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });
  });

  describe("balance validation: shield", () => {
    it("throws INSUFFICIENT_ERC20_BALANCE when ERC-20 balance too low", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(50n); // ERC-20 balanceOf < amount

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientERC20Balance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("ERC-20 check always runs regardless of options", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(50n); // ERC-20 balanceOf < amount

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientERC20Balance,
      });
    });

    it("passes ERC-20 check and proceeds to shield", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf >= amount
        .mockResolvedValueOnce(1000n); // allowance >= amount

      const result = await token.shield(100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes ERC-20 check when balance exactly equals amount (boundary)", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockResolvedValueOnce(100n) // ERC-20 balanceOf === amount
        .mockResolvedValueOnce(1000n); // allowance >= amount

      const result = await token.shield(100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("skips ERC-20 check for ETH shield (underlying is zero address)", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x0000000000000000000000000000000000000000",
      ); // #getUnderlying = zero address

      const result = await token.shield(100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("wraps ERC-20 balanceOf read failure as ERC20_READ_FAILED", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // #getUnderlying
        .mockRejectedValueOnce(new Error("RPC unavailable")); // balanceOf fails

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.ERC20ReadFailed,
        message: expect.stringContaining("Could not read ERC-20 balance"),
      });
    });
  });

  describe("balance validation: unshield", () => {
    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when balance is zero handle", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE); // confidentialBalanceOf

      await expect(token.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("throws BALANCE_CHECK_UNAVAILABLE when no credentials cached", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf

      await expect(token.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
      });
    });

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 50n });

      await expect(token.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("passes validation and submits when balance is sufficient", async ({
      relayer,
      signer,
      token,
      handle,
      userAddress,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 200n });

      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.unshield(50n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes validation when balance exactly equals amount (boundary)", async ({
      relayer,
      signer,
      token,
      handle,
      userAddress,
    }) => {
      await token.allow();

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle); // confidentialBalanceOf
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.unshield(100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("skipBalanceCheck: true bypasses confidential validation", async ({
      signer,
      userAddress,
      token,
    }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.unshield(50n, { skipBalanceCheck: true });
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes callbacks alongside skipBalanceCheck", async ({ signer, userAddress, token }) => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const onUnwrapSubmitted = vi.fn();
      const result = await token.unshield(50n, {
        skipBalanceCheck: true,
        onUnwrapSubmitted,
      });
      expect(result.txHash).toBe("0xtxhash");
      expect(onUnwrapSubmitted).toHaveBeenCalled();
    });
  });
});
