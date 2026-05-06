import { createMockRelayer, describe, it, expect, vi, TEST_ADDR_B } from "../test-fixtures";
import { Token } from "../token/token";
import {
  DecryptionFailedError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  ZamaError,
  ZamaErrorCode,
} from "../errors";
import { MAX_UINT64 } from "../contracts/constants";
import { ZamaSDKEvents } from "../events/sdk-events";
import { ZERO_HANDLE } from "../utils/handles";
import type { GenericSigner, WalletAccountChange, WalletAccountListener } from "../types";
import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandle } from "../query/user-decrypt";

const NEXT_USER_ADDRESS = TEST_ADDR_B;

describe("ZamaSDK", () => {
  it("exposes signer and storage", ({ sdk, signer, storage }) => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createToken returns Token", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("createToken exposes the SDK instance", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("creates distinct instances per address", ({ sdk }) => {
    const t1 = sdk.createToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(t2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  it("terminate delegates to relayer.terminate", ({ sdk, relayer }) => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("[Symbol.dispose] delegates to terminate", ({ sdk, relayer }) => {
    sdk[Symbol.dispose]();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("subscribes to signer wallet account changes", ({ createMockSigner, createSDK }) => {
    const unsubscribe = vi.fn();
    const walletAccount = createMockSigner().walletAccount.getSnapshot();
    const subscribe = vi.fn((listener: WalletAccountListener) => {
      if (walletAccount) {
        listener({ previous: undefined, next: walletAccount });
      }
      return unsubscribe;
    });
    const subscribeSigner = {
      ...createMockSigner(),
      walletAccount: {
        getSnapshot: vi.fn().mockReturnValue(walletAccount),
        subscribe,
        isReady: vi.fn().mockReturnValue(true),
      },
    };

    const sdk = createSDK({ signer: subscribeSigner });

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function));

    sdk.terminate();
  });

  it("terminate calls unsubscribe from signer wallet account subscription", ({
    createMockSigner,
    createSDK,
  }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      walletAccount: {
        getSnapshot: vi.fn().mockReturnValue(createMockSigner().walletAccount.getSnapshot()),
        subscribe: vi.fn().mockReturnValue(unsubscribe),
        isReady: vi.fn().mockReturnValue(true),
      },
    };

    const sdk = createSDK({ signer: subscribeSigner });

    sdk.terminate();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("terminate calls signer.dispose", ({ createMockSigner, createSDK }) => {
    const dispose = vi.fn();
    const sdk = createSDK({ signer: { ...createMockSigner(), dispose } });

    sdk.terminate();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("refreshes a not-ready signer once before checking chain alignment", async ({
    createMockSigner,
    createSDK,
    provider,
  }) => {
    const walletAccount = createMockSigner().walletAccount.getSnapshot()!;
    const requireWalletAccount = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new WalletAccountNotReadyError("testOp");
      })
      .mockReturnValue(walletAccount);
    const refreshWalletAccount = vi.fn().mockResolvedValue(walletAccount);
    const sdk = createSDK({
      signer: {
        ...createMockSigner(),
        requireWalletAccount,
        refreshWalletAccount,
      },
    });
    vi.mocked(provider.getChainId).mockResolvedValue(walletAccount.chainId);

    await expect(sdk.requireChainAlignment("testOp")).resolves.toBe(walletAccount.chainId);
    expect(refreshWalletAccount).toHaveBeenCalledOnce();
    expect(requireWalletAccount).toHaveBeenCalledTimes(2);
  });

  it("does not fail when subscribe returns a no-op unsubscribe", ({ sdk }) => {
    sdk.terminate();
  });

  describe("keypairTTL validation", () => {
    it("throws when keypairTTL is 0", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: 0 })).toThrow(
        "keypairTTL must be a positive integer number of seconds",
      );
    });

    it("throws when keypairTTL is negative", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: -1 })).toThrow(
        "keypairTTL must be a positive integer number of seconds",
      );
    });

    it("throws when keypairTTL is NaN", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: NaN })).toThrow(
        "keypairTTL must be a positive integer number of seconds",
      );
    });

    it("accepts keypairTTL exactly at the 365-day maximum without warning", ({ createSDK }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MAX = 365 * 86400;
      createSDK({ keypairTTL: MAX });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("throws when keypairTTL is Infinity", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: Infinity })).toThrow(
        "keypairTTL must be a positive integer number of seconds",
      );
    });

    it("throws when keypairTTL is fractional", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: 1.5 })).toThrow(
        "keypairTTL must be a positive integer number of seconds",
      );
    });
  });

  describe("lifecycle wallet account change", () => {
    function createSubscribeSigner(mockSigner: GenericSigner) {
      let capturedOnWalletAccountChange: WalletAccountListener;
      const signer = {
        ...mockSigner,
        walletAccount: {
          getSnapshot: vi.fn().mockReturnValue(mockSigner.walletAccount.getSnapshot()),
          subscribe: vi.fn((onWalletAccountChange: WalletAccountListener) => {
            capturedOnWalletAccountChange = onWalletAccountChange;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      };
      const emitChange = (change: WalletAccountChange) => capturedOnWalletAccountChange(change);
      return { signer, emitChange };
    }

    it("clears decrypt cache for previous requester", async ({
      createMockSigner,
      createSDK,
      handle,
      tokenAddress,
      userAddress,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({ signer });

      await sdk.cache.set(userAddress, tokenAddress, handle, 123n);
      await sdk.cache.set(NEXT_USER_ADDRESS, tokenAddress, handle, 456n);

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: { address: NEXT_USER_ADDRESS, chainId: 31337 },
      });

      await vi.waitFor(async () => {
        expect(await sdk.cache.get(userAddress, tokenAddress, handle)).toBeNull();
      });
      expect(await sdk.cache.get(NEXT_USER_ADDRESS, tokenAddress, handle)).toBe(456n);

      sdk.terminate();
    });

    it("notifies listeners even when relayer chain switching fails", async ({
      createMockSigner,
      createMockRelayer,
      createSDK,
    }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());
      const relayer = createMockRelayer({
        switchChain: vi.fn(() => {
          throw new Error("unknown chain");
        }),
      });
      const sdk = createSDK({ relayer, signer });
      const listener = vi.fn();
      sdk.onWalletAccountChange(listener);

      emitChange({
        previous: undefined,
        next: { address: NEXT_USER_ADDRESS, chainId: 1 },
      });

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          previous: undefined,
          next: { address: NEXT_USER_ADDRESS, chainId: 1 },
        });
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("switch relayer chain"),
        expect.any(Error),
      );

      warnSpy.mockRestore();
      sdk.terminate();
    });

    it("fans out wallet account listeners without waiting for slow listeners", async ({
      createMockSigner,
      createSDK,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());
      const sdk = createSDK({ signer });
      let releaseSlowListener: () => void = () => {};
      const slowListener = vi.fn(() => {
        return new Promise<void>((resolve) => {
          releaseSlowListener = resolve;
        });
      });
      const fastListener = vi.fn();
      sdk.onWalletAccountChange((change) => {
        void slowListener(change);
      });
      sdk.onWalletAccountChange(fastListener);

      emitChange({
        previous: undefined,
        next: undefined,
      });

      await vi.waitFor(() => {
        expect(fastListener).toHaveBeenCalledOnce();
      });
      expect(slowListener).toHaveBeenCalledOnce();
      releaseSlowListener();

      sdk.terminate();
    });
  });

  describe("decrypt", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("decrypts handles via relayer and caches results", async ({ sdk, relayer, handle }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      const result1 = await sdk.userDecrypt(handles);
      expect(result1[handle]).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      // Second call should hit cache — relayer not called again
      const result2 = await sdk.userDecrypt(handles);
      expect(result2[handle]).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    });

    it("groups handles by contract address", async ({ sdk, relayer, handle }) => {
      const handle2 = ("0x" + "cd".repeat(32)) as Address;
      vi.mocked(relayer.userDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockResolvedValueOnce({ [handle2]: 2000n });

      const handles: DecryptHandle[] = [
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_B },
      ];

      const result = await sdk.userDecrypt(handles);
      expect(result[handle]).toBe(1000n);
      expect(result[handle2]).toBe(2000n);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("skips already-cached handles", async ({ sdk, relayer, handle }) => {
      const handle2 = ("0x" + "cd".repeat(32)) as Address;

      // First call caches handle
      await sdk.userDecrypt([{ handle, contractAddress: CONTRACT_A }]);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });

      const result = await sdk.userDecrypt([
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_A },
      ]);
      expect(result[handle2]).toBe(2000n);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);

      const secondCall = vi.mocked(relayer.userDecrypt).mock.calls[1]![0];
      expect(secondCall.handles).toEqual([handle2]);
    });

    it("returns empty object when no handles provided", async ({ sdk, relayer }) => {
      const result = await sdk.userDecrypt([]);
      expect(result).toEqual({});
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("maps zero handles to 0n without hitting the relayer", async ({ sdk, relayer }) => {
      const result = await sdk.userDecrypt([
        { handle: ZERO_HANDLE as Handle, contractAddress: CONTRACT_A },
      ]);
      expect(result[ZERO_HANDLE]).toBe(0n);
      expect(relayer.userDecrypt).not.toHaveBeenCalled();
    });

    it("handles mix of zero and real handles", async ({ sdk, relayer, handle }) => {
      const result = await sdk.userDecrypt([
        { handle: ZERO_HANDLE as Handle, contractAddress: CONTRACT_A },
        { handle, contractAddress: CONTRACT_A },
      ]);
      expect(result[ZERO_HANDLE]).toBe(0n);
      expect(result[handle]).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    });

    it("emits DecryptStart and DecryptEnd events with handles and result", async ({
      createSDK,
      handle,
    }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.userDecrypt([{ handle, contractAddress: CONTRACT_A }]);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptStart,
          handles: [handle],
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptEnd,
          durationMs: expect.any(Number),
          handles: [handle],
          result: { [handle]: 1000n },
        }),
      );
    });

    it("emits DecryptError event with handles on failure and wraps the error", async ({
      createSDK,
      relayer,
      handle,
    }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(sdk.userDecrypt([{ handle, contractAddress: CONTRACT_A }])).rejects.toThrow(
        DecryptionFailedError,
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptStart,
          handles: [handle],
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptError,
          durationMs: expect.any(Number),
          handles: [handle],
        }),
      );
    });

    it("does not emit events for empty handles", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.userDecrypt([]);

      expect(events).toEqual([]);
    });

    it("does not emit events when all handles are zero or cached", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.userDecrypt([{ handle: ZERO_HANDLE as Handle, contractAddress: CONTRACT_A }]);

      const decryptEvents = events.filter(
        (e) =>
          e.type === ZamaSDKEvents.DecryptStart ||
          e.type === ZamaSDKEvents.DecryptEnd ||
          e.type === ZamaSDKEvents.DecryptError,
      );
      expect(decryptEvents).toEqual([]);
    });

    it("derives contract addresses from ALL handles, not just uncached", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handle2 = ("0x" + "cd".repeat(32)) as Handle;

      // First call caches handle for CONTRACT_A
      await sdk.userDecrypt([{ handle, contractAddress: CONTRACT_A }]);

      // Second call: handle is cached, handle2 is not — both contracts should be in allow()
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });

      await sdk.userDecrypt([
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_B },
      ]);

      // Both contracts should trigger a createEIP712 call that covers them
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });

  describe("delegatedUserDecrypt", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;
    const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
    // uint64 max — permanent on-chain delegation. The freshness check inside
    // `delegatedUserDecrypt` reads `getUserDecryptionDelegationExpirationDate`
    // before serving cached plaintext; tests that exercise the cache return
    // path must therefore mock readContract.
    const ACTIVE_DELEGATION = 2n ** 64n - 1n;

    it("decrypts handles via relayer and caches results", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      const result1 = await sdk.delegatedUserDecrypt(handles, DELEGATOR);
      expect(result1[handle]).toBe(1000n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      // Second call should hit cache
      const result2 = await sdk.delegatedUserDecrypt(handles, DELEGATOR);
      expect(result2[handle]).toBe(1000n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    });

    it("returns empty object when no handles provided", async ({ sdk, relayer }) => {
      const result = await sdk.delegatedUserDecrypt([], DELEGATOR);
      expect(result).toEqual({});
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    it("maps zero handles to 0n without hitting the relayer", async ({ sdk, relayer }) => {
      const result = await sdk.delegatedUserDecrypt(
        [{ handle: ZERO_HANDLE as Handle, contractAddress: CONTRACT_A }],
        DELEGATOR,
      );
      expect(result[ZERO_HANDLE]).toBe(0n);
      expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    });

    it("handles mix of zero and real handles", async ({ sdk, relayer, handle }) => {
      const result = await sdk.delegatedUserDecrypt(
        [
          { handle: ZERO_HANDLE as Handle, contractAddress: CONTRACT_A },
          { handle, contractAddress: CONTRACT_A },
        ],
        DELEGATOR,
      );
      expect(result[ZERO_HANDLE]).toBe(0n);
      expect(result[handle]).toBe(1000n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    });

    it("groups handles by contract address", async ({ sdk, relayer, handle }) => {
      const handle2 = ("0x" + "cd".repeat(32)) as Address;
      vi.mocked(relayer.delegatedUserDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockResolvedValueOnce({ [handle2]: 2000n });

      const result = await sdk.delegatedUserDecrypt(
        [
          { handle, contractAddress: CONTRACT_A },
          { handle: handle2, contractAddress: CONTRACT_B },
        ],
        DELEGATOR,
      );
      expect(result[handle]).toBe(1000n);
      expect(result[handle2]).toBe(2000n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
    });

    it("skips already-cached handles", async ({ sdk, relayer, provider, handle }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      const handle2 = ("0x" + "cd".repeat(32)) as Address;

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });

      const result = await sdk.delegatedUserDecrypt(
        [
          { handle, contractAddress: CONTRACT_A },
          { handle: handle2, contractAddress: CONTRACT_A },
        ],
        DELEGATOR,
      );
      expect(result[handle2]).toBe(2000n);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);

      const secondCall = vi.mocked(relayer.delegatedUserDecrypt).mock.calls[1]![0];
      expect(secondCall.handles).toEqual([handle2]);
    });

    it("emits DecryptStart and DecryptEnd events", async ({ createSDK, handle }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptStart,
          handles: [handle],
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptEnd,
          durationMs: expect.any(Number),
          handles: [handle],
          result: { [handle]: 1000n },
        }),
      );
    });

    it("emits DecryptError on failure and wraps with isDelegated=true", async ({
      createSDK,
      relayer,
      handle,
    }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(
        sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR),
      ).rejects.toThrow(DecryptionFailedError);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.DecryptError,
          handles: [handle],
        }),
      );
    });

    it("uses delegateAddress for cache key when provided", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      const ACCOUNT = "0xdDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address;

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR, ACCOUNT);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      // Same call with same delegateAddress should hit cache
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR, ACCOUNT);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      // Same call with different delegateAddress (default = delegator) should NOT hit cache
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
    });

    it("does not emit events for fully-cached calls", async ({ createSDK, provider, handle }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);

      events.length = 0;
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(events.filter((e) => e.type === ZamaSDKEvents.DecryptStart)).toHaveLength(0);
    });

    it("validates delegated credentials before returning cached plaintext", async ({
      createSDK,
      relayer,
      signer,
      provider,
      handle,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      const sdk = createSDK();

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      await sdk.clearCredentials();
      vi.mocked(signer.signTypedData).mockRejectedValueOnce(new Error("rejected"));

      await expect(
        sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR),
      ).rejects.toThrow();

      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    });

    it("treats time-bound delegation with future expiry as active", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      vi.mocked(provider.getBlockTimestamp).mockResolvedValue(now);
      vi.mocked(provider.readContract).mockResolvedValue(now + 3600n); // expires in 1h

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    });

    it("rejects cached plaintext and re-fetches when on-chain delegation is revoked", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      // First call: delegation active, cache populated.
      vi.mocked(provider.readContract).mockResolvedValueOnce(ACTIVE_DELEGATION);
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      // Second call: on-chain expiry == 0n → revoked. Cache must be ignored
      // and a fresh relayer call must be issued.
      vi.mocked(provider.readContract).mockResolvedValueOnce(0n);
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
    });

    it("rejects cached plaintext when on-chain delegation has expired", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      vi.mocked(provider.getBlockTimestamp).mockResolvedValue(now);

      // First call: permanent delegation, cache populated.
      vi.mocked(provider.readContract).mockResolvedValueOnce(ACTIVE_DELEGATION);
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();

      // Second call: expiry in the past → not active.
      vi.mocked(provider.readContract).mockResolvedValueOnce(now - 1n);
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
    });

    it("invalidates cache only for contracts whose delegation was revoked", async ({
      sdk,
      relayer,
      provider,
      handle,
    }) => {
      const handle2 = ("0x" + "cd".repeat(32)) as Handle;

      // Seed cache for both contracts with active delegations.
      vi.mocked(provider.readContract).mockResolvedValue(ACTIVE_DELEGATION);
      vi.mocked(relayer.delegatedUserDecrypt)
        .mockResolvedValueOnce({ [handle]: 1000n })
        .mockResolvedValueOnce({ [handle2]: 2000n });
      await sdk.delegatedUserDecrypt(
        [
          { handle, contractAddress: CONTRACT_A },
          { handle: handle2, contractAddress: CONTRACT_B },
        ],
        DELEGATOR,
      );
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);

      // Revoke only CONTRACT_A's delegation; CONTRACT_B remains active. The
      // ACL read order matches `allContracts`, which is the dedup'd input
      // contract list — first CONTRACT_A, then CONTRACT_B.
      vi.mocked(provider.readContract)
        .mockReset()
        .mockResolvedValueOnce(0n) // CONTRACT_A → revoked
        .mockResolvedValueOnce(ACTIVE_DELEGATION); // CONTRACT_B → active

      vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [handle]: 1000n });

      await sdk.delegatedUserDecrypt(
        [
          { handle, contractAddress: CONTRACT_A },
          { handle: handle2, contractAddress: CONTRACT_B },
        ],
        DELEGATOR,
      );

      // CONTRACT_A → relayer called again (cache dropped). CONTRACT_B → cache hit.
      expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(3);
      const lastCall = vi.mocked(relayer.delegatedUserDecrypt).mock.calls.at(-1)![0];
      expect(lastCall.contractAddress).toBe(CONTRACT_A);
      expect(lastCall.handles).toEqual([handle]);
    });
  });

  describe("publicDecrypt", () => {
    it("delegates to relayer.publicDecrypt and returns the result", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const result = await sdk.publicDecrypt([handle]);
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
      expect(result).toEqual({
        clearValues: { [handle]: 500n },
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    });

    it("returns empty result for empty handles without calling relayer", async ({
      sdk,
      relayer,
    }) => {
      const result = await sdk.publicDecrypt([]);
      expect(result).toEqual({
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      });
      expect(relayer.publicDecrypt).not.toHaveBeenCalled();
    });

    it("wraps error on failure", async ({ sdk, relayer, handle }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(sdk.publicDecrypt([handle])).rejects.toThrow(DecryptionFailedError);
    });

    it("re-throws DecryptionFailedError as-is", async ({ sdk, relayer, handle }) => {
      const original = new DecryptionFailedError("already typed");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(sdk.publicDecrypt([handle])).rejects.toBe(original);
    });
  });

  describe("allow", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("triggers a wallet signature when no permit is cached", async ({ sdk, signer }) => {
      await sdk.allow([CONTRACT_A, CONTRACT_B]);
      expect(signer.signTypedData).toHaveBeenCalled();
    });

    it("returns immediately for empty array without calling the signer", async ({
      sdk,
      signer,
    }) => {
      await sdk.allow([]);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("revokePermits clears decrypt cache", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("revokePermits() clears cache — decrypt after revokePermits hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revokePermits();

      // Cache was cleared — relayer is called again
      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("revokePermits(addresses) clears cache for the requester", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revokePermits([CONTRACT_A]);

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });

  describe("encrypt", () => {
    const ENCRYPT_PARAMS = {
      values: [{ value: 100n, type: "euint64" as const }],
      contractAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
      userAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
    };

    it("delegates to relayer.encrypt and returns result", async ({ sdk, relayer }) => {
      const result = await sdk.encrypt(ENCRYPT_PARAMS);

      expect(relayer.encrypt).toHaveBeenCalledWith(ENCRYPT_PARAMS);
      expect(result.handles).toHaveLength(1);
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
    });

    it("emits EncryptStart and EncryptEnd events with tokenAddress", async ({ createSDK }) => {
      const events: { type: string; tokenAddress?: Address }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.encrypt(ENCRYPT_PARAMS);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptStart,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptEnd,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
          durationMs: expect.any(Number),
        }),
      );
    });

    it("wraps non-ZamaError in EncryptionFailed", async ({ sdk, relayer }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.EncryptionFailed &&
          err.message === "Encryption failed"
        );
      });
    });

    it("re-throws ZamaError as-is", async ({ sdk, relayer }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toBe(original);
    });

    it("emits EncryptError with tokenAddress on failure", async ({ createSDK, relayer }) => {
      const events: { type: string; tokenAddress?: Address }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toThrow();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptError,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
          durationMs: expect.any(Number),
        }),
      );
    });
  });

  describe("getDelegationExpiry (sdk)", () => {
    it("reads from ACL contract with the given contract address", async ({
      sdk,
      provider,
      aclAddress,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(1700000000n);

      const expiry = await sdk.getDelegationExpiry({
        contractAddress: tokenAddress,
        delegatorAddress,
        delegateAddress,
      });

      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: aclAddress,
          functionName: "getUserDecryptionDelegationExpirationDate",
          args: [delegatorAddress, delegateAddress, tokenAddress],
        }),
      );
      expect(expiry).toBe(1700000000n);
    });

    it("throws when relayer cannot resolve ACL", async ({
      createSDK,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      const relayerNoAcl = createMockRelayer({
        getAclAddress: vi.fn().mockRejectedValue(new Error("no transport config")),
      });
      const sdkNoAcl = createSDK({ relayer: relayerNoAcl });

      await expect(
        sdkNoAcl.getDelegationExpiry({
          contractAddress: tokenAddress,
          delegatorAddress,
          delegateAddress,
        }),
      ).rejects.toThrow("no transport config");
    });
  });

  describe("isDelegated (sdk)", () => {
    it("returns true when expiry is in the future", async ({
      sdk,
      provider,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
      vi.mocked(provider.readContract).mockResolvedValue(futureTimestamp);

      expect(
        await sdk.isDelegated({
          contractAddress: tokenAddress,
          delegatorAddress,
          delegateAddress,
        }),
      ).toBe(true);
    });

    it("returns false when expiry is 0", async ({
      sdk,
      provider,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(0n);

      expect(
        await sdk.isDelegated({
          contractAddress: tokenAddress,
          delegatorAddress,
          delegateAddress,
        }),
      ).toBe(false);
    });

    it("returns false when expiry is in the past", async ({
      sdk,
      provider,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(1000n);

      expect(
        await sdk.isDelegated({
          contractAddress: tokenAddress,
          delegatorAddress,
          delegateAddress,
        }),
      ).toBe(false);
    });

    it("short-circuits for permanent delegation without fetching block timestamp", async ({
      sdk,
      provider,
      tokenAddress,
      delegatorAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

      expect(
        await sdk.isDelegated({
          contractAddress: tokenAddress,
          delegatorAddress,
          delegateAddress,
        }),
      ).toBe(true);
      expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
    });
  });

  describe("delegateDecryption (sdk)", () => {
    it("calls ACL with the given contract address and expiration date", async ({
      sdk,
      signer,
      aclAddress,
      tokenAddress,
      delegateAddress,
    }) => {
      const expiry = new Date("2030-01-01T00:00:00Z");

      await sdk.delegateDecryption({
        contractAddress: tokenAddress,
        delegateAddress,
        expirationDate: expiry,
      });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: aclAddress,
          functionName: "delegateForUserDecryption",
          args: [delegateAddress, tokenAddress, BigInt(Math.floor(expiry.getTime() / 1000))],
        }),
      );
    });

    it("uses uint64 max when expirationDate is omitted", async ({
      sdk,
      signer,
      tokenAddress,
      delegateAddress,
    }) => {
      await sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "delegateForUserDecryption",
          args: [delegateAddress, tokenAddress, MAX_UINT64],
        }),
      );
    });

    it("returns TransactionResult on success", async ({
      sdk,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(1000n);
      const result = await sdk.delegateDecryption({
        contractAddress: tokenAddress,
        delegateAddress,
      });
      expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
    });

    it("throws DelegationExpirationTooSoonError when expirationDate is too soon", async ({
      sdk,
      tokenAddress,
      delegateAddress,
    }) => {
      const tooSoon = new Date(Date.now() + 60_000);
      await expect(
        sdk.delegateDecryption({
          contractAddress: tokenAddress,
          delegateAddress,
          expirationDate: tooSoon,
        }),
      ).rejects.toBeInstanceOf(DelegationExpirationTooSoonError);
    });

    it("throws DelegationSelfNotAllowedError when delegate equals signer", async ({
      sdk,
      signer,
      tokenAddress,
    }) => {
      const signerAddress = signer.walletAccount.getSnapshot()?.address!;
      await expect(
        sdk.delegateDecryption({
          contractAddress: tokenAddress,
          delegateAddress: signerAddress,
        }),
      ).rejects.toBeInstanceOf(DelegationSelfNotAllowedError);
    });

    it("throws DelegationDelegateEqualsContractError when delegate equals contract", async ({
      sdk,
      tokenAddress,
    }) => {
      await expect(
        sdk.delegateDecryption({
          contractAddress: tokenAddress,
          delegateAddress: tokenAddress,
        }),
      ).rejects.toBeInstanceOf(DelegationDelegateEqualsContractError);
    });

    it("throws DelegationExpiryUnchangedError when current expiry equals new expiry", async ({
      sdk,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(DelegationExpiryUnchangedError);
    });

    it("wraps revert as TransactionRevertedError", async ({
      sdk,
      signer,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toThrow(expect.objectContaining({ code: "TRANSACTION_REVERTED" }));
    });

    it("maps AlreadyDelegatedOrRevokedInSameBlock to DelegationCooldownError", async ({
      sdk,
      signer,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(
        new Error("AlreadyDelegatedOrRevokedInSameBlock"),
      );
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toThrow(expect.objectContaining({ code: "DELEGATION_COOLDOWN" }));
    });

    it("maps EnforcedPause to AclPausedError", async ({
      sdk,
      signer,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("EnforcedPause"));
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toThrow(expect.objectContaining({ code: "ACL_PAUSED" }));
    });

    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });

  describe("revokeDelegation (sdk)", () => {
    it("calls ACL.revokeDelegationForUserDecryption with the given contract", async ({
      sdk,
      signer,
      provider,
      aclAddress,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      await sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: aclAddress,
          functionName: "revokeDelegationForUserDecryption",
          args: [delegateAddress, tokenAddress],
        }),
      );
    });

    it("throws DelegationNotFoundError when no delegation exists (expiry === 0n)", async ({
      sdk,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(0n);
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(DelegationNotFoundError);
    });

    it("returns TransactionResult on success", async ({
      sdk,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      const result = await sdk.revokeDelegation({
        contractAddress: tokenAddress,
        delegateAddress,
      });
      expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
    });

    it("wraps revert as TransactionRevertedError", async ({
      sdk,
      signer,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toThrow(expect.objectContaining({ code: "TRANSACTION_REVERTED" }));
    });

    it("maps AlreadyDelegatedOrRevokedInSameBlock to DelegationCooldownError", async ({
      sdk,
      signer,
      provider,
      tokenAddress,
      delegateAddress,
    }) => {
      vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
      vi.mocked(signer.writeContract).mockRejectedValue(
        new Error("AlreadyDelegatedOrRevokedInSameBlock"),
      );
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toThrow(expect.objectContaining({ code: "DELEGATION_COOLDOWN" }));
    });

    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });
});
