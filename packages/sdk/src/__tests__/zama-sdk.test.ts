import { describe, it, expect, vi, type Mock, TEST_ADDR_B } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { DecryptionFailedError, ZamaError, ZamaErrorCode } from "../errors";
import { ZamaSDKEvents } from "../events/sdk-events";
import { ZERO_HANDLE } from "../utils/handles";
import type { GenericSigner, SignerIdentityChange, SignerIdentityListener } from "../types";
import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandle } from "../query/user-decrypt";

const NEXT_USER_ADDRESS = TEST_ADDR_B;

describe("ZamaSDK", () => {
  it("exposes signer and storage", ({ sdk, signer, storage }) => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", ({ sdk, tokenAddress }) => {
    const token = sdk.createReadonlyToken(tokenAddress);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("createToken returns Token", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
  });

  for (const method of ["createToken", "createReadonlyToken"] as const) {
    it(`${method} exposes the SDK instance`, ({ sdk, tokenAddress }) => {
      const token = sdk[method](tokenAddress);
      expect(token.sdk).toBe(sdk);
    });
  }

  it("creates distinct instances per address", ({ sdk }) => {
    const t1 = sdk.createReadonlyToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createReadonlyToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
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

  it("calls signer.subscribe when available", ({ createMockSigner, createSDK }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdk = createSDK({ signer: subscribeSigner });

    expect(subscribeSigner.subscribe).toHaveBeenCalledOnce();
    expect(subscribeSigner.subscribe).toHaveBeenCalledWith(expect.any(Function));

    sdk.terminate();
  });

  it("terminate calls unsubscribe from signer.subscribe", ({ createMockSigner, createSDK }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdk = createSDK({ signer: subscribeSigner });

    sdk.terminate();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not fail when subscribe returns a no-op unsubscribe", ({ sdk }) => {
    sdk.terminate();
  });

  describe("revokePermits", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("emits CredentialsRevoked event when called with no args", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.revokePermits();

      expect(events).toContainEqual(
        expect.objectContaining({ type: ZamaSDKEvents.CredentialsRevoked }),
      );
    });

    it("emits CredentialsRevoked event when called with addresses", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.revokePermits([CONTRACT_A]);

      expect(events).toContainEqual(
        expect.objectContaining({ type: ZamaSDKEvents.CredentialsRevoked }),
      );
    });
  });

  describe("clearCredentials", () => {
    it("emits CredentialsRevoked", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.clearCredentials();

      expect(events).toContainEqual(
        expect.objectContaining({ type: ZamaSDKEvents.CredentialsRevoked }),
      );
    });
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

    it("caps keypairTTL above 365 days and emits a warning", ({ createSDK }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MAX = 365 * 86400;
      const TOO_BIG = MAX + 1;
      createSDK({ keypairTTL: TOO_BIG });
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0]![0]).toContain("keypairTTL");
      expect(warnSpy.mock.calls[0]![0]).toContain("365 days");
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

  describe("lifecycle identity change", () => {
    function createSubscribeSigner(mockSigner: GenericSigner) {
      let capturedOnIdentityChange: SignerIdentityListener;
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((onIdentityChange: SignerIdentityListener) => {
          capturedOnIdentityChange = onIdentityChange;
          return () => {};
        }),
      };
      const emitChange = (change: SignerIdentityChange) => capturedOnIdentityChange(change);
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

    it("does not notify listeners when relayer chain switching fails", async ({
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
      sdk.onIdentityChange(listener);

      emitChange({
        previous: undefined,
        next: { address: NEXT_USER_ADDRESS, chainId: 1 },
      });

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("switch relayer chain failed"),
          expect.any(Error),
        );
      });
      expect(listener).not.toHaveBeenCalled();

      warnSpy.mockRestore();
      sdk.terminate();
    });

    it("fans out identity listeners without waiting for slow listeners", async ({
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
      sdk.onIdentityChange((change) => {
        void slowListener(change);
      });
      sdk.onIdentityChange(fastListener);

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
});

// Avoid TS6133 on Mock import
export const __unused_Mock = null as Mock | null;
