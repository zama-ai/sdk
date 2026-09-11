import type { Address } from "viem";
import { WrappedToken } from "../../token";
import { beforeEach, describe, expect, test, vi } from "../../test-fixtures";
import { createVault, Vault } from "../vault";

const VAULT_ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const DEPOSIT_BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const REDEEM_BATCHER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
const DEPOSIT_TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SHARE_TOKEN = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const OTHER_ADDRESS = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

function addresses() {
  return { vault: VAULT_ADDRESS, depositBatcher: DEPOSIT_BATCHER, redeemBatcher: REDEEM_BATCHER };
}

describe("Vault", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("checksums the given addresses and exposes each direction's batcher", ({ sdk }) => {
    const vault = createVault(sdk, addresses());
    expect(vault).toBeInstanceOf(Vault);
    expect(vault.address).toBe(VAULT_ADDRESS);
    expect(vault.depositBatcher.address).toBe(DEPOSIT_BATCHER);
    expect(vault.redeemBatcher.address).toBe(REDEEM_BATCHER);
  });

  test("resolves and caches depositToken from the deposit batcher's fromToken", async ({
    sdk,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN);
    const vault = createVault(sdk, addresses());

    const first = await vault.depositToken();
    const second = await vault.depositToken();

    expect(first).toBeInstanceOf(WrappedToken);
    expect(first.address).toBe(DEPOSIT_TOKEN);
    expect(second).toBe(first);
    expect(provider.readContract).toHaveBeenCalledTimes(1);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: DEPOSIT_BATCHER, functionName: "fromToken" }),
    );
  });

  test("resolves shareToken from the deposit batcher's toToken", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(SHARE_TOKEN);
    const vault = createVault(sdk, addresses());

    const shareToken = await vault.shareToken();

    expect(shareToken.address).toBe(SHARE_TOKEN);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: DEPOSIT_BATCHER, functionName: "toToken" }),
    );
  });

  describe("deposit", () => {
    test("grants the batcher an operator approval when none is active, then joins", async ({
      sdk,
      provider,
      signer,
      relayer,
      userAddress,
      handle,
      inputProof,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN); // fromToken()
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(false);
      const setOperator = vi
        .spyOn(WrappedToken.prototype, "setOperator")
        .mockResolvedValue({ txHash: "0xoptxhash", receipt: { logs: [] } });

      const vault = createVault(sdk, addresses());
      const result = await vault.deposit(1_000n);

      expect(setOperator).toHaveBeenCalledWith(DEPOSIT_BATCHER, undefined);
      expect(relayer.encryptValues).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [{ value: 1_000n, type: "euint64" }],
          contractAddress: DEPOSIT_BATCHER,
          userAddress,
        }),
      );
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: DEPOSIT_BATCHER,
          functionName: "join",
          args: [userAddress, handle, inputProof],
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    test("skips the operator grant when one is already active", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN);
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);
      const setOperator = vi.spyOn(WrappedToken.prototype, "setOperator");

      const vault = createVault(sdk, addresses());
      await vault.deposit(1_000n);

      expect(setOperator).not.toHaveBeenCalled();
    });

    test("joins on behalf of an explicit beneficiary", async ({
      sdk,
      provider,
      signer,
      handle,
      inputProof,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN);
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

      const vault = createVault(sdk, addresses());
      await vault.deposit(1_000n, { beneficiary: OTHER_ADDRESS });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [OTHER_ADDRESS, handle, inputProof] }),
      );
    });
  });

  test("requestWithdrawal joins the redeem batcher using the share token's operator grant", async ({
    sdk,
    provider,
    signer,
    relayer,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(SHARE_TOKEN); // toToken()
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const vault = createVault(sdk, addresses());
    await vault.requestWithdrawal(500n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddress: REDEEM_BATCHER }),
    );
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: REDEEM_BATCHER, functionName: "join" }),
    );
  });
});
