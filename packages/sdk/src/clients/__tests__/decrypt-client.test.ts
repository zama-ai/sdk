import type { Address } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import { DecryptionFailedError, SignerNotConfiguredError } from "../../errors";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("DecryptClient", () => {
  describe("user (signer-required)", () => {
    it("throws SignerNotConfiguredError when no signer", async ({ createSDK, handle }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.decrypt.user([{ handle, contractAddress: TOKEN }])).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    it("forwards handles to the underlying service", async ({ sdk, relayer, handle }) => {
      await sdk.decrypt.user([{ handle, contractAddress: TOKEN }]);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    });
  });

  describe("delegatedUser (signer-required)", () => {
    it("throws SignerNotConfiguredError when no signer", async ({ createSDK, handle }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.decrypt.delegated([{ handle, contractAddress: TOKEN }], DELEGATOR),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });

  describe("public (signer-independent)", () => {
    it("works without a signer", async ({ createSDK, handle, relayer }) => {
      const sdk = createSDK({ signer: undefined });
      const result = await sdk.decrypt.public([handle]);

      expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
      expect(result.clearValues[handle]).toBe(500n);
    });

    it("returns empty result for empty handles without calling the relayer", async ({
      sdk,
      relayer,
    }) => {
      const result = await sdk.decrypt.public([]);
      expect(result).toEqual({
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      });
      expect(relayer.publicDecrypt).not.toHaveBeenCalled();
    });

    it("wraps relayer errors through wrapDecryptError", async ({ sdk, relayer, handle }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("relayer down"));
      await expect(sdk.decrypt.public([handle])).rejects.toBeInstanceOf(DecryptionFailedError);
    });

    it("re-throws typed SDK errors as-is (no double-wrap)", async ({ sdk, relayer, handle }) => {
      const original = new DecryptionFailedError("already typed");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);
      await expect(sdk.decrypt.public([handle])).rejects.toBe(original);
    });
  });
});
