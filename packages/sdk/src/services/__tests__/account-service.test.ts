import { describe, expect, test, vi } from "../../test-fixtures";
import type { CredentialService } from "../../credentials/credential-service";
import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../../errors";
import type { CachingService } from "../caching-service";
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
    test("runs credential cleanup, cache clear, and relayer switch before listeners", async ({
      createAccountService,
      createMockSigner,
      createMockRelayer,
    }) => {
      const calls: string[] = [];
      const handleWalletAccountChange = vi.fn(async () => {
        await Promise.resolve();
        calls.push("credential");
      });
      const credentialService = {
        handleWalletAccountChange,
      } as unknown as CredentialService;
      const clearForRequester = vi.fn(async () => {
        calls.push("cache");
      });
      const cache = { clearForRequester } as unknown as CachingService;
      const switchChain = vi.fn(() => {
        calls.push("relayer");
      });
      const relayer = createMockRelayer({ switchChain });
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
      const service = createAccountService({ signer, cache, relayer, credentialService });
      service.onWalletAccountChange(() => {
        calls.push("listener");
      });

      const prev = {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        chainId: 31337,
      } as const;
      const next = {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        chainId: 1,
      } as const;
      dispatch!({ previous: prev, next });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleWalletAccountChange).toHaveBeenCalledWith(prev, next);
      expect(clearForRequester).toHaveBeenCalledWith(prev.address);
      expect(switchChain).toHaveBeenCalledWith(1);
      expect(calls).toEqual(["credential", "cache", "relayer", "listener"]);
    });

    test("skips cache clear when previous account is undefined", async ({
      createAccountService,
      createMockSigner,
    }) => {
      const clearForRequester = vi.fn();
      const cache = { clearForRequester } as unknown as CachingService;
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
      const service = createAccountService({ signer, cache });
      service.onWalletAccountChange(() => {});

      dispatch!({
        previous: undefined,
        next: { address: "0x1111111111111111111111111111111111111111", chainId: 31337 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(clearForRequester).not.toHaveBeenCalled();
    });

    test("skips relayer switch when next account is undefined", async ({
      createAccountService,
      createMockSigner,
      createMockRelayer,
    }) => {
      const switchChain = vi.fn();
      const relayer = createMockRelayer({ switchChain });
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
      const service = createAccountService({ signer, relayer });
      service.onWalletAccountChange(() => {});

      dispatch!({
        previous: { address: "0x1111111111111111111111111111111111111111", chainId: 31337 },
        next: undefined,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(switchChain).not.toHaveBeenCalled();
    });

    test("errors in cleanup steps are swallowed and listeners still run", async ({
      createAccountService,
      createMockSigner,
      createMockRelayer,
    }) => {
      const credentialService = {
        handleWalletAccountChange: vi.fn().mockRejectedValue(new Error("credential boom")),
      } as unknown as CredentialService;
      const cache = {
        clearForRequester: vi.fn().mockRejectedValue(new Error("cache boom")),
      } as unknown as CachingService;
      const relayer = createMockRelayer({
        switchChain: vi.fn(() => {
          throw new Error("relayer boom");
        }),
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
      const service = createAccountService({ signer, cache, relayer, credentialService });
      const listener = vi.fn();
      service.onWalletAccountChange(listener);

      dispatch!({
        previous: { address: "0x1111111111111111111111111111111111111111", chainId: 31337 },
        next: { address: "0x2222222222222222222222222222222222222222", chainId: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalledOnce();
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
