import { Topics } from "../../events";
import { getAddress, type Address } from "viem";
import { DecryptionFailedError, ZamaError, ZamaErrorCode } from "../../errors";
import { isZeroHandle, ZERO_HANDLE } from "../../utils/handles";
import { describe, expect, it, vi } from "../../test-fixtures";

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
    it("returns true when baseline interfaceId (0xd04584ba) matches", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(true) // baseline ID
        .mockResolvedValueOnce(false); // upgraded ID

      expect(await token.isWrapper()).toBe(true);
    });

    it("returns true when new interfaceId (0x1f1c62b2) matches", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(false) // baseline ID
        .mockResolvedValueOnce(true); // upgraded ID

      expect(await token.isWrapper()).toBe(true);
    });

    it("returns false when neither interfaceId matches", async ({ signer, token }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(false) // baseline ID
        .mockResolvedValueOnce(false); // upgraded ID

      expect(await token.isWrapper()).toBe(false);
    });
  });

  describe("isZeroHandle", () => {
    it("returns true for zero handle", () => {
      expect(isZeroHandle(ZERO_HANDLE)).toBe(true);
    });

    it("returns true for 0x", () => {
      expect(isZeroHandle("0x")).toBe(true);
    });

    it("returns false for valid handle", ({ handle }) => {
      expect(isZeroHandle(handle)).toBe(false);
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
    it("calls publicDecrypt with unwrapRequestId and finalizes on-chain", async ({
      relayer,
      signer,
      token,
    }) => {
      // unwrapRequestId comes from the UnwrapRequested event — it is a bytes32 identifier,
      // not the burn amount handle. publicDecrypt must receive this exact value.
      const unwrapRequestId = "0x" + "ab".repeat(32);
      const result = await token.finalizeUnwrap(unwrapRequestId);

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([unwrapRequestId]);
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
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
            err.message === "Public decryption failed"
          );
        },
      );
    });

    it("re-throws DecryptionFailedError from publicDecrypt as-is", async ({
      relayer,

      token,
    }) => {
      const original = new DecryptionFailedError("already wrapped");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toBe(original);
    });

    it("throws TypeError when clearValues does not contain the handle", async ({
      relayer,

      token,
    }) => {
      vi.mocked(relayer.publicDecrypt).mockResolvedValueOnce({
        clearValues: {},
        abiEncodedClearValues: "0x00",
        decryptionProof: "0x12",
      });

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow(TypeError);
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
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 50n });

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("passes validation and submits transaction when balance is sufficient", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 200n });

      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes validation when balance exactly equals amount (boundary)", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

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
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      const result = await token.confidentialTransfer(RECIPIENT, 0n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("re-throws ZamaError from balanceOf (e.g. DecryptionFailedError)", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockRejectedValueOnce(
        new TypeError("network failure"),
      );

      // sdk.userDecrypt wraps the TypeError as DecryptionFailedError (a ZamaError),
      // so #assertConfidentialBalance re-throws it as-is.
      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
      });
    });

    it("wraps non-ZamaError from balanceOf as BALANCE_CHECK_UNAVAILABLE", async ({ token }) => {
      // Spy on balanceOf to throw a raw (non-ZamaError) Error.
      vi.spyOn(token, "balanceOf").mockRejectedValueOnce(new Error("unexpected crash"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
        message: expect.stringContaining("Balance validation failed"),
      });
    });

    it("uses cached plaintext balance (skips decrypt round-trip)", async ({
      signer,
      token,
      handle,
      storage,
    }) => {
      const owner = getAddress(await signer.getAddress());
      const cacheKey = `zama:decrypt:${owner}:${getAddress(token.address)}:${handle.toLowerCase()}`;
      await storage.set(cacheKey, 200n);

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);

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

      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);

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
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      await expect(token.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
      signer,
      token,
      handle,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 50n });

      await expect(token.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("passes validation and submits when balance is sufficient", async ({
      signer,
      token,
      handle,
      userAddress,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 200n });

      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await token.unshield(50n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes validation when balance exactly equals amount (boundary)", async ({
      signer,
      token,
      handle,
      userAddress,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      vi.mocked(token.sdk.relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 100n });

      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
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
