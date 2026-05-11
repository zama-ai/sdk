import { describe, expect, test, vi } from "../../test-fixtures";
import type { CredentialService } from "../../credentials/credential-service";
import type { CachingService } from "../caching-service";
import type { WalletAccountChange } from "../../types";

describe("LifecycleService", () => {
  describe("subscription lifecycle", () => {
    test("subscribes to signer.walletAccount on construct", ({
      createLifecycleService,
      createMockSigner,
    }) => {
      const signer = createMockSigner();
      createLifecycleService({ signer });

      expect(signer.walletAccount.subscribe).toHaveBeenCalledOnce();
    });

    test("does NOT subscribe when no signer", ({ createLifecycleService, createMockSigner }) => {
      const signer = createMockSigner();
      createLifecycleService({ signer: undefined });

      expect(signer.walletAccount.subscribe).not.toHaveBeenCalled();
    });

    test("onWalletAccountChange returns a working unsubscribe when no signer", ({
      createLifecycleService,
    }) => {
      const service = createLifecycleService({ signer: undefined });
      const listener = vi.fn();

      const unsubscribe = service.onWalletAccountChange(listener);
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
    });

    test("dispose() calls the unsubscribe and clears listeners", ({
      createLifecycleService,
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
      const service = createLifecycleService({ signer });
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
      createLifecycleService,
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
      const service = createLifecycleService({ signer, cache, relayer, credentialService });
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
      createLifecycleService,
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
      const service = createLifecycleService({ signer, cache });
      service.onWalletAccountChange(() => {});

      dispatch!({
        previous: undefined,
        next: { address: "0x1111111111111111111111111111111111111111", chainId: 31337 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(clearForRequester).not.toHaveBeenCalled();
    });

    test("skips relayer switch when next account is undefined", async ({
      createLifecycleService,
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
      const service = createLifecycleService({ signer, relayer });
      service.onWalletAccountChange(() => {});

      dispatch!({
        previous: { address: "0x1111111111111111111111111111111111111111", chainId: 31337 },
        next: undefined,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(switchChain).not.toHaveBeenCalled();
    });

    test("errors in cleanup steps are swallowed and listeners still run", async ({
      createLifecycleService,
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
      const service = createLifecycleService({ signer, cache, relayer, credentialService });
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
      createLifecycleService,
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
      const service = createLifecycleService({ signer });
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
      createLifecycleService,
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
      const service = createLifecycleService({ signer });
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
