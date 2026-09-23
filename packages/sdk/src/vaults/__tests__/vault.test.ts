import type { Address } from "viem";
import { ConfigurationError, SignerNotConfiguredError } from "../../errors";
import { WrappedToken } from "../../token";
import {
  beforeEach,
  describe,
  expect,
  mockJoinBalance,
  mockJoinReceipt,
  test,
  vi,
} from "../../test-fixtures";
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
    expect(vault.depositBatcher.address).toBe(DEPOSIT_BATCHER);
    expect(vault.redeemBatcher.address).toBe(REDEEM_BATCHER);
  });

  describe("vaultAddress", () => {
    test("reads it from both batchers, then caches it", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(VAULT_ADDRESS);
      const vault = createVault(sdk, {
        depositBatcher: DEPOSIT_BATCHER,
        redeemBatcher: REDEEM_BATCHER,
      });

      await expect(vault.vaultAddress()).resolves.toBe(VAULT_ADDRESS);
      await expect(vault.vaultAddress()).resolves.toBe(VAULT_ADDRESS);

      expect(provider.readContract).toHaveBeenCalledTimes(2);
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ address: DEPOSIT_BATCHER, functionName: "vault" }),
      );
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ address: REDEEM_BATCHER, functionName: "vault" }),
      );
    });

    test("rejects a batcher pair that points at different vaults", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(VAULT_ADDRESS)
        .mockResolvedValueOnce(OTHER_ADDRESS);
      const vault = createVault(sdk, {
        depositBatcher: DEPOSIT_BATCHER,
        redeemBatcher: REDEEM_BATCHER,
      });

      await expect(vault.vaultAddress()).rejects.toThrow(ConfigurationError);
    });

    test("rejects a configured vault address the batchers disagree with", async ({
      sdk,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(OTHER_ADDRESS);
      const vault = createVault(sdk, addresses());

      await expect(vault.vaultAddress()).rejects.toThrow(ConfigurationError);
    });

    test("accepts a configured vault address the batchers confirm", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(VAULT_ADDRESS);
      const vault = createVault(sdk, addresses());

      await expect(vault.vaultAddress()).resolves.toBe(VAULT_ADDRESS);
    });
  });

  test("resolves and caches cAsset from the deposit batcher's fromToken", async ({
    sdk,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(DEPOSIT_TOKEN);
    const vault = createVault(sdk, addresses());

    const first = await vault.cAsset();
    const second = await vault.cAsset();

    expect(first).toBeInstanceOf(WrappedToken);
    expect(first.address).toBe(DEPOSIT_TOKEN);
    expect(second).toBe(first);
    expect(provider.readContract).toHaveBeenCalledTimes(1);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: DEPOSIT_BATCHER, functionName: "fromToken" }),
    );
  });

  test("resolves cShare from the redeem batcher's fromToken", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(SHARE_TOKEN);
    const vault = createVault(sdk, addresses());

    const cShare = await vault.cShare();

    expect(cShare.address).toBe(SHARE_TOKEN);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: REDEEM_BATCHER, functionName: "fromToken" }),
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
      mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
      mockJoinReceipt(provider, { batcher: DEPOSIT_BATCHER, account: userAddress });
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

    test("skips the operator grant when one is already active", async ({
      sdk,
      provider,
      userAddress,
    }) => {
      mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
      mockJoinReceipt(provider, { batcher: DEPOSIT_BATCHER, account: userAddress });
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);
      const setOperator = vi.spyOn(WrappedToken.prototype, "setOperator");

      const vault = createVault(sdk, addresses());
      await vault.deposit(1_000n);

      expect(setOperator).not.toHaveBeenCalled();
    });

    test("rejects a misconfigured batcher pair before granting any approval", async ({
      sdk,
      provider,
      signer,
    }) => {
      // Batchers agree on `fromToken` but report a vault other than the configured one.
      mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: OTHER_ADDRESS });
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(false);
      const setOperator = vi.spyOn(WrappedToken.prototype, "setOperator");

      const vault = createVault(sdk, addresses());

      await expect(vault.deposit(1_000n)).rejects.toThrow(ConfigurationError);
      expect(setOperator).not.toHaveBeenCalled();
      expect(signer.writeContract).not.toHaveBeenCalled();
    });

    test("throws without a configured signer, naming the operation", async ({
      createSDK,
      provider,
    }) => {
      mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
      const vault = createVault(createSDK({ signer: undefined }), addresses());
      const error: unknown = await vault.deposit(1_000n).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SignerNotConfiguredError);
      expect(error).toMatchObject({ operation: "deposit" });
    });

    test("joins on behalf of an explicit beneficiary", async ({
      sdk,
      provider,
      signer,
      handle,
      inputProof,
    }) => {
      mockJoinBalance(provider, { fromToken: DEPOSIT_TOKEN, vault: VAULT_ADDRESS });
      mockJoinReceipt(provider, { batcher: DEPOSIT_BATCHER, account: OTHER_ADDRESS });
      vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

      const vault = createVault(sdk, addresses());
      await vault.deposit(1_000n, { beneficiary: OTHER_ADDRESS });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [OTHER_ADDRESS, handle, inputProof] }),
      );
    });
  });

  test("redeem joins the redeem batcher using the share token's operator grant", async ({
    sdk,
    provider,
    signer,
    relayer,
    userAddress,
  }) => {
    mockJoinBalance(provider, { fromToken: SHARE_TOKEN, vault: VAULT_ADDRESS });
    mockJoinReceipt(provider, { batcher: REDEEM_BATCHER, account: userAddress });
    vi.spyOn(WrappedToken.prototype, "isOperator").mockResolvedValue(true);

    const vault = createVault(sdk, addresses());
    await vault.redeem(500n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddress: REDEEM_BATCHER }),
    );
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: REDEEM_BATCHER, functionName: "join" }),
    );
  });
});
