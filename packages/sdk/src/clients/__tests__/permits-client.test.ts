import type { Address } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import { ChainMismatchError, SignerNotConfiguredError } from "../../errors";

const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("PermitsClient", () => {
  describe("guards (no signer configured)", () => {
    it("allow throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.grantPermit([CONTRACT_A])).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    it("allowAs throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.permits.grantDelegationPermit(DELEGATOR, [CONTRACT_A]),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("revoke throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.revokePermits()).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("clear throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.clear()).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("isAllowed returns false (no signer required)", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.hasPermit([CONTRACT_A])).resolves.toBe(false);
    });

    it("isAllowedAs returns false (no signer required)", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.hasDelegationPermit(DELEGATOR, [CONTRACT_A])).resolves.toBe(false);
    });
  });

  describe("empty-array short-circuit", () => {
    it("allow([]) returns without calling the signer", async ({ sdk, signer }) => {
      await sdk.permits.grantPermit([]);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    it("allowAs(delegator, []) returns without calling the signer", async ({ sdk, signer }) => {
      await sdk.permits.grantDelegationPermit(DELEGATOR, []);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("chain alignment", () => {
    it("allow throws ChainMismatchError when signer and provider disagree", async ({
      sdk,
      signer,
      provider,
    }) => {
      const account = { address: signer.walletAccount.getSnapshot()!.address, chainId: 1 };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(account);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(account);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      await expect(sdk.permits.grantPermit([CONTRACT_A])).rejects.toMatchObject({
        operation: "grantPermit",
      });
      await expect(sdk.permits.grantPermit([CONTRACT_A])).rejects.toBeInstanceOf(
        ChainMismatchError,
      );
    });

    it("allowAs throws ChainMismatchError when signer and provider disagree", async ({
      sdk,
      signer,
      provider,
    }) => {
      const account = { address: signer.walletAccount.getSnapshot()!.address, chainId: 1 };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(account);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(account);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      await expect(
        sdk.permits.grantDelegationPermit(DELEGATOR, [CONTRACT_A]),
      ).rejects.toMatchObject({
        operation: "grantDelegationPermit",
      });
    });
  });

  describe("delegator routing", () => {
    it("allowAs forwards delegator to the service", async ({ sdk, signer }) => {
      await sdk.permits.grantDelegationPermit(DELEGATOR, [CONTRACT_A]);
      // The underlying CredentialService signs with the delegator scope — the
      // signature must include the delegator address as the delegatorAddress dimension.
      // We assert it was called; deeper invariants live in credential-service tests.
      expect(signer.signTypedData).toHaveBeenCalled();
    });
  });

  describe("happy paths", () => {
    it("allow triggers a wallet signature for uncached contracts", async ({ sdk, signer }) => {
      await sdk.permits.grantPermit([CONTRACT_A, CONTRACT_B]);
      expect(signer.signTypedData).toHaveBeenCalled();
    });

    it("revoke after allow clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ handle, contractAddress: CONTRACT_A }];
      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits();

      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("clear after allow clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ handle, contractAddress: CONTRACT_A }];
      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.clear();

      await sdk.decrypt.user(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });
});
