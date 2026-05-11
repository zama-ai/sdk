import { describe, expect, test, vi } from "../../test-fixtures";
import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../../errors";

describe("AccountService", () => {
  describe("without signer", () => {
    test("requireAlignedWalletAccount throws SignerNotConfiguredError", async ({
      createAccountService,
    }) => {
      const service = createAccountService({ signer: undefined });

      await expect(service.requireAlignedWalletAccount("op")).rejects.toBeInstanceOf(
        SignerNotConfiguredError,
      );
    });

    test("onWalletAccountChange returns a working unsubscribe", ({ createAccountService }) => {
      const service = createAccountService({ signer: undefined });
      const listener = vi.fn();

      const unsubscribe = service.onWalletAccountChange(listener);
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("requireAlignedWalletAccount", () => {
    test("returns the wallet account when chain IDs match", async ({
      createAccountService,
      createMockSigner,
      createMockProvider,
    }) => {
      const signer = createMockSigner();
      const provider = createMockProvider();
      const service = createAccountService({ signer, provider });

      const account = await service.requireAlignedWalletAccount("op");

      expect(account.chainId).toBe(31337);
      expect(signer.requireWalletAccount).toHaveBeenCalledWith("op");
    });

    test("throws ChainMismatchError when signer and provider chains differ", async ({
      createAccountService,
      createMockSigner,
      createMockProvider,
    }) => {
      const signer = createMockSigner();
      const provider = createMockProvider({
        getChainId: vi.fn().mockResolvedValue(1),
      });
      const service = createAccountService({ signer, provider });

      await expect(service.requireAlignedWalletAccount("op")).rejects.toBeInstanceOf(
        ChainMismatchError,
      );
    });

    test("refreshes on WalletAccountNotReadyError and retries", async ({
      createAccountService,
      createMockSigner,
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
      const service = createAccountService({ signer });

      const result = await service.requireAlignedWalletAccount("op");

      expect(refreshWalletAccount).toHaveBeenCalledOnce();
      expect(requireWalletAccount).toHaveBeenCalledTimes(2);
      expect(result).toEqual(account);
    });

    test("rethrows non-WalletAccountNotReadyError errors without refresh", async ({
      createAccountService,
      createMockSigner,
    }) => {
      const refreshWalletAccount = vi.fn();
      const signer = createMockSigner(undefined, {
        requireWalletAccount: vi.fn(() => {
          throw new Error("boom");
        }),
        refreshWalletAccount,
      });
      const service = createAccountService({ signer });

      await expect(service.requireAlignedWalletAccount("op")).rejects.toThrow("boom");
      expect(refreshWalletAccount).not.toHaveBeenCalled();
    });
  });

  describe("requireChainAlignment", () => {
    test("returns the aligned chain ID", async ({ createAccountService, createMockSigner }) => {
      const service = createAccountService({ signer: createMockSigner() });

      await expect(service.requireChainAlignment("op")).resolves.toBe(31337);
    });
  });
});
