import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../../errors";
import { describe, expect, test, vi } from "../../test-fixtures";
import { requireAlignedWalletAccount, requireChainAlignment } from "../wallet-account-alignment";

describe("requireAlignedWalletAccount", () => {
  test("throws SignerNotConfiguredError when no signer is provided", async ({
    createMockProvider,
  }) => {
    const provider = createMockProvider();

    await expect(requireAlignedWalletAccount("op", undefined, provider)).rejects.toBeInstanceOf(
      SignerNotConfiguredError,
    );
  });

  test("returns the wallet account when chain IDs match", async ({
    createMockSigner,
    createMockProvider,
  }) => {
    const signer = createMockSigner();
    const provider = createMockProvider();

    const account = await requireAlignedWalletAccount("op", signer, provider);

    expect(account.chainId).toBe(31337);
    expect(signer.requireWalletAccount).toHaveBeenCalledWith("op");
  });

  test("throws ChainMismatchError when signer and provider chains differ", async ({
    createMockSigner,
    createMockProvider,
  }) => {
    const signer = createMockSigner();
    const provider = createMockProvider({
      getChainId: vi.fn().mockResolvedValue(1),
    });

    await expect(requireAlignedWalletAccount("op", signer, provider)).rejects.toBeInstanceOf(
      ChainMismatchError,
    );
  });

  test("refreshes on WalletAccountNotReadyError and retries", async ({
    createMockSigner,
    createMockProvider,
  }) => {
    const account = {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 31337,
    } as const;
    const requireWalletAccount = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new WalletAccountNotReadyError("op");
      })
      .mockReturnValueOnce(account);
    const refreshWalletAccount = vi.fn().mockResolvedValue(account);
    const signer = createMockSigner(undefined, {
      requireWalletAccount,
      refreshWalletAccount,
    });
    const provider = createMockProvider();

    const result = await requireAlignedWalletAccount("op", signer, provider);

    expect(refreshWalletAccount).toHaveBeenCalledOnce();
    expect(requireWalletAccount).toHaveBeenCalledTimes(2);
    expect(result).toEqual(account);
  });

  test("rethrows non-WalletAccountNotReadyError errors without refresh", async ({
    createMockSigner,
    createMockProvider,
  }) => {
    const refreshWalletAccount = vi.fn();
    const signer = createMockSigner(undefined, {
      requireWalletAccount: vi.fn(() => {
        throw new Error("boom");
      }),
      refreshWalletAccount,
    });
    const provider = createMockProvider();

    await expect(requireAlignedWalletAccount("op", signer, provider)).rejects.toThrow("boom");
    expect(refreshWalletAccount).not.toHaveBeenCalled();
  });
});

describe("requireChainAlignment", () => {
  test("returns the aligned chain ID", async ({ createMockSigner, createMockProvider }) => {
    await expect(
      requireChainAlignment("op", createMockSigner(), createMockProvider()),
    ).resolves.toBe(31337);
  });
});
