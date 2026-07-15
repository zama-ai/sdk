import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { createMockSigner } from "../../test-fixtures/signer";
import { ChainMismatchError, ConfigurationError, SignerNotConfiguredError } from "../../errors";

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

    test("warmTransportKeyPair resolves silently (no signer required)", async ({
      createSDK,
      relayer,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.permits.warmTransportKeyPair()).resolves.toBeUndefined();
      expect(relayer.generateTransportKeyPair).not.toHaveBeenCalled();
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
      ).rejects.toMatchObject({ operation: "grantDelegationPermit" });
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

    test("warmTransportKeyPair generates the keypair against the active dispatcher chain", async ({
      sdk,
      relayer,
    }) => {
      vi.mocked(relayer.generateTransportKeyPair).mockClear();

      await sdk.permits.warmTransportKeyPair();

      expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
    });

    test("warmTransportKeyPair resolves silently when the signer has no wallet snapshot", async ({
      sdk,
      signer,
      relayer,
    }) => {
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(undefined);
      vi.mocked(relayer.generateTransportKeyPair).mockClear();

      await expect(sdk.permits.warmTransportKeyPair()).resolves.toBeUndefined();
      expect(relayer.generateTransportKeyPair).not.toHaveBeenCalled();
    });

    test("revokePermits() after grantPermit clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ encryptedValue: handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits();

      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
    });

    test("revokePermits(addresses) clears the decrypt cache for the requester", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ encryptedValue: handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledOnce();

      await sdk.permits.revokePermits([CONTRACT_A]);

      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
    });

    test("clear after grantPermit clears the decrypt cache for the signer", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles = [{ encryptedValue: handle, contractAddress: CONTRACT_A }];
      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledOnce();

      await sdk.permits.clear();

      await sdk.decryption.decryptValues(handles);
      expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
    });
  });

  describe("scope (opt-in shared-tenant)", () => {
    test("revokeTransportKeyPair throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
    }) => {
      const sdk = createSDK({ signer: undefined, transportKeyPairScope: "tenant-1" });
      await expect(sdk.permits.revokeTransportKeyPair("tenant-1")).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    test("warmScope throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
    }) => {
      const sdk = createSDK({ signer: undefined, transportKeyPairScope: "tenant-1" });
      await expect(sdk.permits.warmScope()).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("revokeTransportKeyPair throws ConfigurationError when no scope is configured", async ({
      sdk,
    }) => {
      await expect(sdk.permits.revokeTransportKeyPair("tenant-1")).rejects.toBeInstanceOf(
        ConfigurationError,
      );
    });

    test("warmScope throws ConfigurationError when no scope is configured", async ({ sdk }) => {
      await expect(sdk.permits.warmScope()).rejects.toBeInstanceOf(ConfigurationError);
    });

    test("warmScope succeeds with a signer configured but no connected wallet account — unlike warmTransportKeyPair", async ({
      createSDK,
      signer,
      relayer,
    }) => {
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(undefined);
      const sdk = createSDK({ transportKeyPairScope: "tenant-1" });

      // The sibling per-signer primitive silently no-ops under this exact condition —
      // this is precisely the gap warmScope exists to not have.
      await expect(sdk.permits.warmTransportKeyPair()).resolves.toBeUndefined();
      expect(relayer.generateTransportKeyPair).not.toHaveBeenCalled();

      await sdk.permits.warmScope();
      expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
    });

    test("revokeTransportKeyPair succeeds with a signer configured but no connected wallet account", async ({
      createSDK,
      signer,
    }) => {
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(undefined);
      const sdk = createSDK({ transportKeyPairScope: "tenant-1" });

      await sdk.permits.warmScope();
      await expect(sdk.permits.revokeTransportKeyPair("tenant-1")).resolves.toBeUndefined();
    });

    test("warmTransportKeyPair, despite its per-signer-sounding name, mis-keys into a scope's shared slot when a scope is configured", async ({
      createSDK,
      storage,
      relayer,
    }) => {
      const signerB = createMockSigner(DELEGATOR);
      const sdkA = createSDK({ transportKeyPairScope: "tenant-1", storage });
      const sdkB = createSDK({ transportKeyPairScope: "tenant-1", storage, signer: signerB });

      vi.mocked(relayer.generateTransportKeyPair).mockClear();
      await sdkA.permits.warmTransportKeyPair();
      expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();

      // sdkB is a *different* signer sharing the same scope + storage. If
      // warmTransportKeyPair() had actually kept its per-signer contract, sdkB would
      // find no key under its own address and generate one of its own here. It doesn't
      // — because with a scope configured, `address` is ignored for storage keying and
      // sdkA's warm already landed in the shared slot sdkB also reads from.
      await sdkB.permits.grantPermit([CONTRACT_A]);
      expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
    });
  });
});
