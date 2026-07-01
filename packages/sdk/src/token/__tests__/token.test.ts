import { getAddress, type Address } from "viem";
import {
  DecryptionFailedError,
  TransactionRevertedError,
  ZamaError,
  ZamaErrorCode,
} from "../../errors";
import { ZERO_ENCRYPTED_VALUE } from "../../utils/handles";
import { describe, expect, test, vi } from "../../test-fixtures";

describe("Token", () => {
  describe("balanceOf", () => {
    test("returns 0n for zero handle without decrypting", async ({
      relayer,
      token,
      userAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_ENCRYPTED_VALUE);

      const balance = await token.balanceOf(userAddress);

      expect(balance).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    test("decrypts non-zero handle and returns balance", async ({
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
      expect(relayer.generateTransportKeyPair).toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalled();
      expect(relayer.userDecrypt).toHaveBeenCalled();
    });

    test("passes the caller-supplied owner address to the contract read", async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ZERO_ENCRYPTED_VALUE);
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
    test("returns the raw handle without decrypting", async ({
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
    test("returns true when ERC-165 check passes", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(true);
      expect(await token.isConfidential()).toBe(true);
    });

    test("returns false when ERC-165 check fails", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(false);
      expect(await token.isConfidential()).toBe(false);
    });
  });

  describe("isWrapper", () => {
    test("returns true when interfaceId (0x1f1c62b2) matches", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(true);

      expect(await token.isWrapper()).toBe(true);
    });

    test("returns false when interfaceId does not match", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(false);

      expect(await token.isWrapper()).toBe(false);
    });
  });

  describe("name / symbol / decimals", () => {
    test("reads the token name", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce("My Token");
      expect(await token.name()).toBe("My Token");
    });

    test("reads the token symbol", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce("MTK");
      expect(await token.symbol()).toBe("MTK");
    });

    test("reads the token decimals", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(18);
      expect(await token.decimals()).toBe(18);
    });
  });

  describe("confidentialTransfer", () => {
    test("encrypts amount and sends transaction", async ({
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

    test("throws EncryptionFailed when encrypt returns empty encrypted values", async ({
      relayer,
      token,
      inputProof,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({ encryptedValues: [], inputProof });

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no encrypted values",
      });
    });

    test("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toBe(original);
    });

    test("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toMatchObject({ code: ZamaErrorCode.TransactionReverted });
    });
  });

  describe("confidentialTransferFrom", () => {
    test("encrypts amount with from as userAddress and sends transaction", async ({
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

    test("wraps non-ZamaError from writeContract in TransactionReverted", async ({
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
      ).rejects.toMatchObject({ code: ZamaErrorCode.TransactionReverted });
    });
  });

  describe("confidentialTransferAndCall", () => {
    const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
    const DATA = "0xdeadbeef" as const;

    test("encrypts amount, forwards data and sends transaction", async ({
      relayer,
      signer,
      userAddress,
      token,
      tokenAddress,
      handle,
      inputProof,
    }) => {
      const result = await token.confidentialTransferAndCall(RECIPIENT, 100n, DATA, {
        skipBalanceCheck: true,
      });

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 100n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress,
      });
      // Pin the full ordered args so a wrong-order regression fails here, not only in contracts.test.ts.
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransferAndCall",
          args: [getAddress(RECIPIENT), handle, inputProof, DATA],
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    test("throws EncryptionFailed when encrypt returns empty encrypted values", async ({
      relayer,
      token,
      inputProof,
    }) => {
      vi.mocked(relayer.encrypt).mockResolvedValueOnce({ encryptedValues: [], inputProof });

      await expect(
        token.confidentialTransferAndCall(RECIPIENT, 100n, DATA, { skipBalanceCheck: true }),
      ).rejects.toMatchObject({
        code: ZamaErrorCode.EncryptionFailed,
        message: "Encryption returned no encrypted values",
      });
    });

    test("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransferAndCall(RECIPIENT, 100n, DATA, { skipBalanceCheck: true }),
      ).rejects.toMatchObject({ code: ZamaErrorCode.TransactionReverted });
    });

    test("validates balance when skipBalanceCheck is not set", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_ENCRYPTED_VALUE);

      await expect(token.confidentialTransferAndCall(RECIPIENT, 100n, DATA)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    test("invokes onEncryptComplete callback", async ({ token }) => {
      const onEncryptComplete = vi.fn();
      await token.confidentialTransferAndCall(RECIPIENT, 100n, DATA, {
        skipBalanceCheck: true,
        onEncryptComplete,
      });
      expect(onEncryptComplete).toHaveBeenCalled();
    });
  });

  describe("confidentialTransferFromAndCall", () => {
    const FROM = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
    const TO = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
    const DATA = "0xdeadbeef" as const;

    test("encrypts amount with from as userAddress, forwards data and sends transaction", async ({
      relayer,
      signer,
      token,
      tokenAddress,
      handle,
      inputProof,
    }) => {
      const result = await token.confidentialTransferFromAndCall(FROM, TO, 200n, DATA);

      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 200n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress: getAddress(FROM),
      });
      // Pin the full ordered args so a wrong-order regression fails here, not only in contracts.test.ts.
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransferFromAndCall",
          args: [getAddress(FROM), getAddress(TO), handle, inputProof, DATA],
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    test("wraps non-ZamaError from writeContract in TransactionReverted", async ({
      signer,
      token,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.confidentialTransferFromAndCall(FROM, TO, 200n, DATA),
      ).rejects.toMatchObject({ code: ZamaErrorCode.TransactionReverted });
    });

    test("invokes onEncryptComplete callback", async ({ token }) => {
      const onEncryptComplete = vi.fn();
      await token.confidentialTransferFromAndCall(FROM, TO, 200n, DATA, { onEncryptComplete });
      expect(onEncryptComplete).toHaveBeenCalled();
    });
  });

  describe("setOperator", () => {
    test("calls setOperatorContract with operator", async ({ signer, token }) => {
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

    test("wraps error in TransactionReverted", async ({ signer, token }) => {
      const rootCause = new Error("tx failed");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(rootCause);

      const thrown = await token
        .setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address)
        .catch((error) => error);

      expect(thrown).toBeInstanceOf(TransactionRevertedError);
      expect(thrown).toMatchObject({ code: ZamaErrorCode.TransactionReverted });
      expect(thrown.cause).toBe(rootCause);
    });

    test("re-throws ZamaError from writeContract as-is", async ({ signer, token }) => {
      const original = new ZamaError(ZamaErrorCode.TransactionReverted, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(
        token.setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
      ).rejects.toBe(original);
    });
  });

  describe("isOperator", () => {
    test("returns boolean result from readContract", async ({ token, provider }) => {
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

    test("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when balance is zero handle", async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_ENCRYPTED_VALUE);

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.InsufficientConfidentialBalance,
      });
    });

    test("throws INSUFFICIENT_CONFIDENTIAL_BALANCE when amount exceeds decrypted balance", async ({
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

    test("passes validation and submits transaction when balance is sufficient", async ({
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

    test("passes validation when balance exactly equals amount (boundary)", async ({
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

    test("skipBalanceCheck: true bypasses validation", async ({ token }) => {
      const result = await token.confidentialTransfer(RECIPIENT, 100n, { skipBalanceCheck: true });
      expect(result.txHash).toBe("0xtxhash");
    });

    test("passes callbacks alongside skipBalanceCheck", async ({ token }) => {
      const onEncryptComplete = vi.fn();
      const result = await token.confidentialTransfer(RECIPIENT, 100n, {
        skipBalanceCheck: true,
        onEncryptComplete,
      });
      expect(result.txHash).toBe("0xtxhash");
      expect(onEncryptComplete).toHaveBeenCalled();
    });

    test("allows zero-amount transfer when handle is zero", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_ENCRYPTED_VALUE);

      const result = await token.confidentialTransfer(RECIPIENT, 0n);
      expect(result.txHash).toBe("0xtxhash");
    });

    test("re-throws ZamaError from balanceOf (e.g. DecryptionFailedError)", async ({
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

    test("wraps non-ZamaError from balanceOf as BALANCE_CHECK_UNAVAILABLE", async ({ token }) => {
      vi.spyOn(token, "balanceOf").mockRejectedValueOnce(new Error("unexpected crash"));

      await expect(token.confidentialTransfer(RECIPIENT, 100n)).rejects.toMatchObject({
        code: ZamaErrorCode.BalanceCheckUnavailable,
      });
    });

    test("uses cached plaintext balance (skips decrypt round-trip)", async ({
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

    test("rejects from cache when cached balance is insufficient", async ({
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

    test("returns 0n for zero handle without calling relayer", async ({
      relayer,
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_ENCRYPTED_VALUE);

      const balance = await token.decryptBalanceAs({ delegatorAddress: DELEGATOR });

      expect(balance).toBe(0n);
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    test("decrypts via sdk.delegatedUserDecrypt on happy path", async ({
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

    test("throws DecryptionFailedError when relayer returns no value for handle", async ({
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
