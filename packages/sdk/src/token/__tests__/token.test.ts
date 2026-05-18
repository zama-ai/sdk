import { getAddress, type Address } from "viem";
import {
  DecryptionFailedError,
  TransactionRevertedError,
  ZamaError,
  ZamaErrorCode,
} from "../../errors";
import { ZERO_HANDLE } from "../../utils/handles";
import { describe, expect, it, vi } from "../../test-fixtures";

describe("Token", () => {
  describe("balanceOf", () => {
    it("returns 0n for zero handle without decrypting", async ({
      relayer,
      token,
      userAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);

      const balance = await token.balanceOf(userAddress);

      expect(balance).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async ({
      relayer,
      signer,
      token,
      handle,
      userAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);

      const balance = await token.balanceOf(userAddress);

      expect(balance).toBe(1000n);
      expect(relayer.generateKeypair).toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalled();
      expect(relayer.userDecrypt).toHaveBeenCalled();
    });

    it("passes the caller-supplied owner address to the contract read", async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_HANDLE);
      const otherAddress = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

      await token.balanceOf(otherAddress);

      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialBalanceOf",
          args: [getAddress(otherAddress)],
        }),
      );
    });
  });

  describe("confidentialBalanceOf", () => {
    it("returns the raw handle without decrypting", async ({
      relayer,
      token,
      handle,
      userAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(handle);

      const result = await token.confidentialBalanceOf(userAddress);

      expect(result).toBe(handle);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });
  });

  describe("isConfidential", () => {
    it("returns true when ERC-165 check passes", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(true);
      expect(await token.isConfidential()).toBe(true);
    });

    it("returns false when ERC-165 check fails", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(false);
      expect(await token.isConfidential()).toBe(false);
    });
  });

  describe("isWrapper", () => {
    it("returns true when baseline interfaceId (0xd04584ba) matches", async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(true) // baseline ID
        .mockResolvedValueOnce(false); // upgraded ID

      expect(await token.isWrapper()).toBe(true);
    });

    it("returns true when new interfaceId (0x1f1c62b2) matches", async ({ token, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(false) // baseline ID
        .mockResolvedValueOnce(true); // upgraded ID

      expect(await token.isWrapper()).toBe(true);
    });

    it("returns false when neither interfaceId matches", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

      expect(await token.isWrapper()).toBe(false);
    });
  });

  describe("name / symbol / decimals", () => {
    it("reads the token name", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce("My Token");
      expect(await token.name()).toBe("My Token");
    });

    it("reads the token symbol", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce("MTK");
      expect(await token.symbol()).toBe("MTK");
    });

    it("reads the token decimals", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(18);
      expect(await token.decimals()).toBe(18);
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
        userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "confidentialTransfer" }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    it("throws EncryptionFailed when encrypt returns empty handles", async ({ relayer, token }) => {
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
        expect.objectContaining({ functionName: "confidentialTransferFrom" }),
      );
      expect(result.txHash).toBe("0xtxhash");
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
      });
    });
  });

  describe("setOperator", () => {
    it("calls setOperatorContract with operator", async ({ signer, token }) => {
      const operator = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

      const result = await token.setOperator(operator);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "setOperator",
          args: expect.arrayContaining([operator]),
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    it("wraps error in TransactionReverted", async ({ signer, token }) => {
      const rootCause = new Error("tx failed");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(rootCause);

      const thrown = await token
        .setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address)
        .catch((error: Error) => error);

      expect(thrown).toBeInstanceOf(TransactionRevertedError);
      expect(thrown).toMatchObject({ code: ZamaErrorCode.TransactionReverted });
      expect(thrown.cause).toBe(rootCause);
    });

    it("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
      ).rejects.toBe(original);
    });
  });

  describe("isOperator", () => {
    it("returns boolean result from readContract", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(true);

      const result = await token.isOperator(
        "0x9F9f9F9F9F9f9F9f9F9f9F9f9F9F9F9F9F9f9F9f" as Address,
        "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address,
      );

      expect(result).toBe(true);
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "isOperator" }),
      );
    });
  });

  describe("balance validation: confidentialTransfer", () => {
    const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when balance is zero handle", async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    it("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 50n });

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });

    it("passes validation and submits transaction when balance is sufficient", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 200n });

      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("passes validation when balance exactly equals amount (boundary)", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);
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

    it("allows zero-amount transfer when handle is zero", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      const result = await token.confidentialTransfer(RECIPIENT, 0n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("re-throws ZamaError from balanceOf (e.g. DecryptionFailedError)", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);
      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new TypeError("network failure"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
      });
    });

    it("wraps non-ZamaError from balanceOf as BALANCE_CHECK_UNAVAILABLE", async ({ token }) => {
      vi.spyOn(token, "balanceOf").mockRejectedValueOnce(new Error("unexpected crash"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
      });
    });

    it("uses cached plaintext balance (skips decrypt round-trip)", async ({
      signer,
      token,
      handle,
      storage,
      provider,
    }) => {
      const owner = getAddress(signer.walletAccount.getSnapshot()!.address);
      const cacheKey = `zama:decrypt:${owner}:${getAddress(token.address)}:${handle.toLowerCase()}`;
      await storage.set(cacheKey, 200n);

      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);

      const result = await token.confidentialTransfer(RECIPIENT, 100n);
      expect(result.txHash).toBe("0xtxhash");
    });

    it("rejects from cache when cached balance is insufficient", async ({
      signer,
      token,
      handle,
      storage,
      provider,
    }) => {
      const owner = getAddress(signer.walletAccount.getSnapshot()!.address);
      const cacheKey = `zama:decrypt:${owner}:${getAddress(token.address)}:${handle.toLowerCase()}`;
      await storage.set(cacheKey, 50n);

      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
        message: expect.stringContaining("requested 100"),
      });
    });
  });

  // shield / unshield balance-validation lives on WrappedToken — see
  // wrapped-token.test.ts for the ERC-20 and confidential balance checks.

  describe("decryptBalanceAs", () => {
    const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

    it("returns 0n for zero handle without calling relayer", async ({
      relayer,
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_HANDLE);

      const balance = await token.decryptBalanceAs({ delegatorAddress: DELEGATOR });

      expect(balance).toBe(0n);
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts via sdk.delegatedUserDecrypt on happy path", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(handle) // confidentialBalanceOf
        .mockResolvedValueOnce(2n ** 64n - 1n); // getDelegationExpiry → permanent
      vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [handle]: 1234n });

      const balance = await token.decryptBalanceAs({ delegatorAddress: DELEGATOR });

      expect(balance).toBe(1234n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    });

    it("throws DecryptionFailedError when relayer returns no value for handle", async ({
      relayer,
      token,
      handle,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(handle)
        .mockResolvedValueOnce(2n ** 64n - 1n);
      vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({});

      await expect(token.decryptBalanceAs({ delegatorAddress: DELEGATOR })).rejects.toMatchObject({
        code: ZamaErrorCode.DecryptionFailed,
      });
    });
  });
});

// Suppress unused import warning when DecryptionFailedError isn't referenced above
void DecryptionFailedError;
