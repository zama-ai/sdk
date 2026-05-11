import { describe, expect, test, vi } from "../../test-fixtures";
import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../../errors";
import type { WalletAccountChange } from "../../types";

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

  describe("subscription lifecycle", () => {
    test("subscribes to signer.walletAccount on construct", ({
      createAccountService,
      createMockSigner,
    }) => {
      const signer = createMockSigner();
      createAccountService({ signer });

      expect(signer.walletAccount.subscribe).toHaveBeenCalledOnce();
    });

    test("does NOT subscribe when no signer", ({ createAccountService, createMockSigner }) => {
      const signer = createMockSigner();
      createAccountService({ signer: undefined });

      expect(signer.walletAccount.subscribe).not.toHaveBeenCalled();
    });

    test("dispose() calls the unsubscribe and clears listeners", ({
      createAccountService,
      createMockSigner,
    }) => {
      const unsubscribe = vi.fn();
      const signer = createMockSigner(undefined, {
        walletAccount: {
          getSnapshot: vi.fn(),
          subscribe: vi.fn().mockReturnValue(unsubscribe),
          isReady: vi.fn().mockReturnValue(true),
        },
      });
      const service = createAccountService({ signer });
      const listener = vi.fn();
      service.onWalletAccountChange(listener);

      service.dispose();

      expect(unsubscribe).toHaveBeenCalledOnce();

      // Second dispose() is a no-op
      service.dispose();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe("change dispatch", () => {
    test("invokes onBeforeDispatch before listeners", async ({
      createAccountService,
      createMockSigner,
    }) => {
      const calls: string[] = [];
      const onBeforeDispatch = vi.fn(async () => {
        await Promise.resolve();
        calls.push("before");
      });
      let dispatch: ((change: WalletAccountChange) => void) | undefined;
      const signer = createMockSigner(undefined, {
        walletAccount: {
          getSnapshot: vi.fn(),
          subscribe: vi.fn((listener: (change: WalletAccountChange) => void) => {
            dispatch = listener;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      });
      const service = createAccountService({ signer, onBeforeDispatch });
      service.onWalletAccountChange(() => {
        calls.push("listener");
      });

      const account = {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 31337,
      } as const;
      dispatch!({ previous: undefined, next: account });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onBeforeDispatch).toHaveBeenCalledOnce();
      expect(calls).toEqual(["before", "listener"]);
    });

    test("a throwing listener does not prevent others from running", async ({
      createAccountService,
      createMockSigner,
    }) => {
      let dispatch: ((change: WalletAccountChange) => void) | undefined;
      const signer = createMockSigner(undefined, {
        walletAccount: {
          getSnapshot: vi.fn(),
          subscribe: vi.fn((listener: (change: WalletAccountChange) => void) => {
            dispatch = listener;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      });
      const service = createAccountService({ signer });
      const survivor = vi.fn();
      service.onWalletAccountChange(() => {
        throw new Error("listener boom");
      });
      service.onWalletAccountChange(survivor);

      const account = {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 31337,
      } as const;
      dispatch!({ previous: undefined, next: account });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(survivor).toHaveBeenCalledOnce();
    });

    test("a rejecting onBeforeDispatch is swallowed and listeners still run", async ({
      createAccountService,
      createMockSigner,
    }) => {
      let dispatch: ((change: WalletAccountChange) => void) | undefined;
      const signer = createMockSigner(undefined, {
        walletAccount: {
          getSnapshot: vi.fn(),
          subscribe: vi.fn((listener: (change: WalletAccountChange) => void) => {
            dispatch = listener;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      });
      const onBeforeDispatch = vi.fn().mockRejectedValue(new Error("before boom"));
      const service = createAccountService({ signer, onBeforeDispatch });
      const listener = vi.fn();
      service.onWalletAccountChange(listener);

      const account = {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 31337,
      } as const;
      dispatch!({ previous: undefined, next: account });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalledOnce();
    });

    test("unsubscribed listener is not invoked", async ({
      createAccountService,
      createMockSigner,
    }) => {
      let dispatch: ((change: WalletAccountChange) => void) | undefined;
      const signer = createMockSigner(undefined, {
        walletAccount: {
          getSnapshot: vi.fn(),
          subscribe: vi.fn((listener: (change: WalletAccountChange) => void) => {
            dispatch = listener;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      });
      const service = createAccountService({ signer });
      const listener = vi.fn();
      const unsub = service.onWalletAccountChange(listener);
      unsub();

      const account = {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 31337,
      } as const;
      dispatch!({ previous: undefined, next: account });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
