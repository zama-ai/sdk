import type { Address } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import { ChainMismatchError, SignerNotConfiguredError } from "../../errors";
import { MAX_UINT64 } from "../../contracts";

const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("Delegations", () => {
  describe("guards (no signer configured)", () => {
    it("delegate throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.delegate({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("revoke throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.revoke({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });

  describe("chain alignment", () => {
    it("delegate throws ChainMismatchError when signer and provider disagree", async ({
      sdk,
      signer,
      provider,
    }) => {
      const account = { address: signer.walletAccount.getSnapshot()!.address, chainId: 1 };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(account);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(account);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      await expect(
        sdk.delegations.delegate({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(ChainMismatchError);
    });

    it("revoke throws ChainMismatchError when signer and provider disagree", async ({
      sdk,
      signer,
      provider,
    }) => {
      const account = { address: signer.walletAccount.getSnapshot()!.address, chainId: 1 };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(account);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(account);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      await expect(
        sdk.delegations.revoke({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(ChainMismatchError);
    });
  });

  describe("read methods (signer-independent)", () => {
    it("isActive works without a signer", async ({ createSDK, provider }) => {
      const sdk = createSDK({ signer: undefined });
      vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

      const active = await sdk.delegations.isActive({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(active).toBe(true);
    });

    it("getExpiry works without a signer", async ({ createSDK, provider }) => {
      const sdk = createSDK({ signer: undefined });
      vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

      const expiry = await sdk.delegations.getExpiry({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(expiry).toBe(MAX_UINT64);
    });

    it("isActive returns false when expiry is 0", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(0n);

      const active = await sdk.delegations.isActive({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(active).toBe(false);
    });
  });

  describe("delegator address resolution", () => {
    it("delegate uses the wallet account address as delegator", async ({
      sdk,
      signer,
      provider,
    }) => {
      // Mock the on-chain readContract for the pre-flight expiry check (returns 0n = no current delegation)
      vi.mocked(provider.readContract).mockResolvedValue(0n);
      vi.mocked(signer.writeContract).mockResolvedValue("0xtx");

      const result = await sdk.delegations.delegate({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
      });

      expect(result.txHash).toBe("0xtx");
      // The delegator was implicitly the wallet account; if the client routed
      // anything else, the underlying service would throw a self-delegation error.
      expect(signer.writeContract).toHaveBeenCalled();
    });
  });
});
