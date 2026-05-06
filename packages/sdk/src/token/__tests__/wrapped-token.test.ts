import type { Address } from "viem";
import { Topics } from "../../events";
import { DecryptionFailedError, ZamaError, ZamaErrorCode } from "../../errors";
import { ZERO_HANDLE } from "../../utils/handles";
import { describe, expect, it, vi } from "../../test-fixtures";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;

describe("WrappedToken", () => {
  describe("underlying / allowance", () => {
    it("reads the underlying token address", async ({ wrappedToken, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING);

      const result = await wrappedToken.underlying();

      expect(result).toBe(UNDERLYING);
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "underlying" }),
      );
    });

    it("reads the underlying ERC-20 allowance for the wrapper", async ({
      wrappedToken,
      provider,
      userAddress,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING) // #getUnderlying
        .mockResolvedValueOnce(500n); // allowance

      const allowance = await wrappedToken.allowance(userAddress);

      expect(allowance).toBe(500n);
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "allowance" }),
      );
    });
  });

  describe("shield", () => {
    it("checks allowance and shields", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING) // #getUnderlying
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
        .mockResolvedValueOnce(0n); // allowance

      const result = await wrappedToken.shield(100n);

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
      expect(result.txHash).toBe("0xtxhash");
    });

    it("skips approval when allowance is sufficient", async ({
      signer,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(200n);

      await wrappedToken.shield(100n);

      expect(signer.writeContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("skips approval when approvalStrategy is skip", async ({
      signer,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n);

      await wrappedToken.shield(100n, { approvalStrategy: "skip" });

      // underlying + supportsInterface (ERC-1363) + balanceOf
      expect(provider.readContract).toHaveBeenCalledTimes(3);
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    it("approves max uint256 with approvalStrategy max", async ({
      signer,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(0n);

      await wrappedToken.shield(100n, { approvalStrategy: "max" });

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
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(50n); // existing non-zero allowance < amount

      await wrappedToken.shield(100n);

      // reset to zero, then approve exact, then wrap = 3 calls
      expect(signer.writeContract).toHaveBeenCalledTimes(3);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "approve", args: expect.arrayContaining([0n]) }),
      );
    });

    it("throws INSUFFICIENT_ERC20_BALANCE when ERC-20 balance too low", async ({
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(false).mockResolvedValueOnce(50n);

      await expect(wrappedToken.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientERC20Balance,
      });
    });

    it("wraps ERC-20 balanceOf read failure as ERC20_READ_FAILED", async ({
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockRejectedValueOnce(new Error("RPC unavailable"));

      await expect(wrappedToken.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.ERC20ReadFailed,
      });
    });

    it("wraps write failure in TransactionReverted", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n); // ERC-20 balanceOf
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(wrappedToken.shield(100n, { approvalStrategy: "skip" })).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "ApproveAndWrap shield transaction failed",
      });
    });
  });

  describe("approveUnderlying", () => {
    it("defaults to max uint256 approval", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n); // currentAllowance

      await wrappedToken.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("resets to zero first when existing non-zero allowance", async ({
      signer,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(50n);

      await wrappedToken.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ args: expect.arrayContaining([0n]) }),
      );
    });

    it("accepts custom amount", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

      await wrappedToken.approveUnderlying(500n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: expect.arrayContaining([500n]) }),
      );
    });

    it("wraps error in ApprovalFailed", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("approve failed"));

      await expect(wrappedToken.approveUnderlying()).rejects.toMatchObject({
        code: ZamaErrorCode.ApprovalFailed,
      });
    });
  });

  describe("unwrap / unwrapAll", () => {
    it("unwrap encrypts amount and sends transaction", async ({
      relayer,
      signer,
      userAddress,
      wrappedToken,
      wrapperAddress,
    }) => {
      const result = await wrappedToken.unwrap(50n);

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 50n, type: "euint64" }],
        contractAddress: wrapperAddress,
        userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    it("unwrap throws EncryptionFailed when encrypt returns empty handles", async ({
      relayer,
      wrappedToken,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({
        handles: [],
        inputProof: new Uint8Array([4, 5, 6]),
      });

      await expect(wrappedToken.unwrap(50n)).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
      });
    });

    it("unwrapAll uses existing balance handle and sends to userAddress", async ({
      relayer,
      signer,
      userAddress,
      wrappedToken,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);

      await wrappedToken.unwrapAll();

      expect(relayer.encrypt).not.toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          args: [userAddress, userAddress, handle],
        }),
      );
    });

    it("unwrapAll throws when balance is zero", async ({ wrappedToken, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);

      await expect(wrappedToken.unwrapAll()).rejects.toThrow("balance is zero");
    });
  });

  describe("finalizeUnwrap", () => {
    it("calls publicDecrypt and finalizes on-chain", async ({ relayer, signer, wrappedToken }) => {
      const unwrapRequestId = ("0x" + "ab".repeat(32)) as `0x${string}`;
      const result = await wrappedToken.finalizeUnwrap(unwrapRequestId);

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([unwrapRequestId]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    it("re-throws DecryptionFailedError from publicDecrypt as-is", async ({
      relayer,
      wrappedToken,
    }) => {
      const original = new DecryptionFailedError("already wrapped");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(wrappedToken.finalizeUnwrap("0xburn" as Address)).rejects.toBe(original);
    });

    it("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      wrappedToken,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(wrappedToken.finalizeUnwrap("0xburn" as Address)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
        message: "Failed to finalize unshield",
      });
    });
  });

  describe("unshield orchestration", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

    it("unshield orchestrates unwrap → receipt → finalizeUnwrap", async ({
      relayer,
      signer,
      userAddress,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequestedLegacy,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await wrappedToken.unshield(50n, { skipBalanceCheck: true });

      expect(relayer.encrypt).toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith("0xtxhash");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    it("unshieldAll orchestrates unwrapAll → receipt → finalizeUnwrap", async ({
      relayer,
      userAddress,
      wrappedToken,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequestedLegacy,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await wrappedToken.unshieldAll();

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("unshield throws when no UnwrapRequested event in receipt", async ({
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

      await expect(wrappedToken.unshield(50n, { skipBalanceCheck: true })).rejects.toThrow(
        "No UnwrapRequested event found in unshield receipt",
      );
    });

    it("resumeUnshield resumes from existing tx hash", async ({
      relayer,
      userAddress,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequestedLegacy,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await wrappedToken.resumeUnshield("0xprevioustx" as `0x${string}`);

      expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
    });
  });

  describe("balance validation: unshield", () => {
    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when balance is zero handle", async ({
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      await expect(wrappedToken.unshield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("skipBalanceCheck: true bypasses confidential validation", async ({
      userAddress,
      wrappedToken,
      provider,
    }) => {
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequestedLegacy,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });

      const result = await wrappedToken.unshield(50n, { skipBalanceCheck: true });
      expect(result.txHash).toBe("0xtxhash");
    });
  });

  describe("ZamaError re-throw", () => {
    it("shield re-throws ZamaError from approve", async ({ signer, wrappedToken, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(0n);
      const original = new ZamaError(ZamaErrorCode.ApprovalFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(wrappedToken.shield(100n)).rejects.toBe(original);
    });

    it("unwrap re-throws ZamaError from writeContract", async ({ signer, wrappedToken }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(wrappedToken.unwrap(50n)).rejects.toBe(original);
    });
  });
});
