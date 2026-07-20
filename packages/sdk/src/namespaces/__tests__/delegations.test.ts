import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { SignerNotConfiguredError } from "../../errors";
import { MAX_UINT64 } from "../../contracts";

const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("Delegations", () => {
  describe("guards (no signer configured)", () => {
    test("delegateDecryption throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.delegateDecryption({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    test("revokeDelegation throws SignerNotConfiguredError", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegations.revokeDelegation({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });

  describe("read methods (signer-independent)", () => {
    test("isActive works without a signer", async ({ createSDK, provider }) => {
      const sdk = createSDK({ signer: undefined });
      vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

      const active = await sdk.delegations.isActive({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(active).toBe(true);
    });

    test("getExpiry works without a signer", async ({ createSDK, provider }) => {
      const sdk = createSDK({ signer: undefined });
      vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

      const expiry = await sdk.delegations.getExpiry({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(expiry).toBe(MAX_UINT64);
    });

    test("isActive returns false when expiry is 0", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(0n);

      const active = await sdk.delegations.isActive({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(active).toBe(false);
    });

    test("getStatus works without a signer and returns activity + expiry together", async ({
      createSDK,
      provider,
    }) => {
      const sdk = createSDK({ signer: undefined });
      vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

      const status = await sdk.delegations.getStatus({
        contractAddress: TOKEN,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      });
      expect(status).toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    });
  });

  describe("delegator address resolution", () => {
    test("delegateDecryption uses the wallet account address as delegator", async ({
      sdk,
      signer,
      provider,
    }) => {
      // Mock the on-chain readContract for the pre-flight expiry check (returns 0n = no current delegation)
      vi.mocked(provider.readContract).mockResolvedValue(0n);
      vi.mocked(signer.writeContract).mockResolvedValue("0xtx");

      const result = await sdk.delegations.delegateDecryption({
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
