import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { DecryptionFailedError, SignerNotConfiguredError } from "../../errors";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("Decryption", () => {
  describe("user (signer-required)", () => {
    test("throws SignerNotConfiguredError when no signer", async ({ createSDK, handle }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.decryption.userDecrypt([{ handle, contractAddress: TOKEN }]),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("forwards handles to the underlying service", async ({ sdk, relayer, handle }) => {
      await sdk.decryption.userDecrypt([{ handle, contractAddress: TOKEN }]);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    });
  });

  describe("delegatedUser (signer-required)", () => {
    test("throws SignerNotConfiguredError when no signer", async ({ createSDK, handle }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.decryption.delegatedDecrypt([{ handle, contractAddress: TOKEN }], DELEGATOR),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });

  describe("public (signer-independent)", () => {
    test("works without a signer", async ({ createSDK, handle, relayer }) => {
      const sdk = createSDK({ signer: undefined });
      const result = await sdk.decryption.publicDecrypt([handle]);

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
      expect(result.clearValues[handle]).toBe(500n);
    });

    test("returns empty result for empty handles without calling the relayer", async ({
      sdk,
      relayer,
    }) => {
      const result = await sdk.decryption.publicDecrypt([]);
      expect(result).toEqual({
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      });
      expect(relayer.publicDecrypt).not.toHaveBeenCalled();
    });

    test("wraps relayer errors through wrapDecryptError", async ({ sdk, relayer, handle }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("relayer down"));
      await expect(sdk.decryption.publicDecrypt([handle])).rejects.toBeInstanceOf(
        DecryptionFailedError,
      );
    });

    test("re-throws typed SDK errors as-is (no double-wrap)", async ({ sdk, relayer, handle }) => {
      const original = new DecryptionFailedError("already typed");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);
      await expect(sdk.decryption.publicDecrypt([handle])).rejects.toBe(original);
    });
  });
});
