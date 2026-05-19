import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { ChainMismatchError, SignerNotConfiguredError } from "../../errors";

const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("Permits", () => {
  describe("guards (no signer configured)", () => {
    test("grantPermit throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.grantPermit([CONTRACT_A])).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    test("grantDelegationPermit throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.permits.grantDelegationPermit(DELEGATOR, [CONTRACT_A]),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("revokePermits throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.revokePermits()).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("clear throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.clear()).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("hasPermit returns false (no signer required)", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.hasPermit([CONTRACT_A])).resolves.toBe(false);
    });

    test("hasDelegationPermit returns false (no signer required)", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.hasDelegationPermit(DELEGATOR, [CONTRACT_A])).resolves.toBe(false);
    });
  });

  describe("empty-array short-circuit", () => {
    test("grantPermit([]) returns without calling the signer", async ({ sdk, signer }) => {
      await sdk.permits.grantPermit([]);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });

    test("grantDelegationPermit(delegator, []) returns without calling the signer", async ({
      sdk,
      signer,
    }) => {
      await sdk.permits.grantDelegationPermit(DELEGATOR, []);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("chain alignment", () => {
    test("grantPermit throws ChainMismatchError when signer and provider disagree", async ({
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

    test("grantDelegationPermit throws ChainMismatchError when signer and provider disagree", async ({
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

  describe("happy paths", () => {
    test("grantPermit triggers a wallet signature for uncached contracts", async ({
      sdk,
      signer,
    }) => {
      await sdk.permits.grantPermit([CONTRACT_A, CONTRACT_B]);
      expect(signer.signTypedData).toHaveBeenCalled();
    });

    test("revokePermits() after grantPermit clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits();

      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    test("revokePermits(addresses) clears the decrypt cache for the requester", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits([CONTRACT_A]);

      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    test("clear after grantPermit clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.permits.clear();

      await sdk.decryption.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });
});
