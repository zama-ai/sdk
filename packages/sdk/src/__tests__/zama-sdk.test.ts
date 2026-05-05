import {
  createMockRelayer,
  describe,
  it,
  expect,
  vi,
  type Mock,
  TEST_ADDR_B,
} from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { CredentialsManager } from "../credentials/credentials-manager";
import {
  ConfigurationError,
  DecryptionFailedError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
  SignerRequiredError,
  ZamaError,
  ZamaErrorCode,
} from "../errors";
import { MAX_UINT64 } from "../contracts/constants";
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
      expect(token.sdk.delegatedCredentials).toBe(sdk.delegatedCredentials);
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
    // Should not throw
    sdk.terminate();
  });

  it("credentials.revoke clears session storage", async ({ sdk, signer, sessionStorage }) => {
    // Simulate a cached session signature by computing the same store key
    // the CredentialsManager uses.
    const address = await signer.getAddress();
    const chainId = await signer.getChainId();
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);

    await sessionStorage.set(storeKey, "0xsomeSignature");
    expect(await sessionStorage.get(storeKey)).toBe("0xsomeSignature");

    await sdk.credentials!.revoke();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  it("revokeSession clears session storage", async ({ sdk, signer, sessionStorage }) => {
    const address = await signer.getAddress();
    const chainId = await signer.getChainId();
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);

    await sessionStorage.set(storeKey, "0xsomeSignature");
    expect(await sessionStorage.get(storeKey)).toBe("0xsomeSignature");

    await sdk.revokeSession();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  it("revokeSession emits CredentialsRevoked event", async ({ createSDK }) => {
    const events: { type: string }[] = [];
    const sdk = createSDK({ onEvent: (e) => events.push(e) });

    await sdk.revokeSession();

    expect(events).toContainEqual(
      expect.objectContaining({ type: ZamaSDKEvents.CredentialsRevoked }),
    );
  });

  it("revokeSession revokes the current session signature", async ({
    sdk,
    sessionStorage,
    userAddress,
  }) => {
    const key = await CredentialsManager.computeStoreKey(userAddress, 31337);
    await sessionStorage.set(key, "0xsig");

    await sdk.revokeSession();

    expect(await sessionStorage.get(key)).toBeNull();
  });

  it("revokeSession clears cache even when session revoke fails", async ({ createSDK, signer }) => {
    const sdk = createSDK();
    const credentials = sdk.requireCredentials("test");
    const clearSpy = vi.spyOn(sdk.cache, "clearForRequester").mockResolvedValueOnce(undefined);
    vi.spyOn(credentials, "revokeFor").mockRejectedValueOnce(new Error("session blew up"));

    await expect(sdk.revokeSession()).rejects.toThrow("session blew up");
    expect(clearSpy).toHaveBeenCalledWith(await signer.getAddress());
  });

  describe("keypairTTL validation", () => {
    it("throws when keypairTTL is 0", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: 0 })).toThrow(
        "keypairTTL must be a positive number (seconds)",
      );
    });

    it("throws when keypairTTL is negative", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: -1 })).toThrow(
        "keypairTTL must be a positive number (seconds)",
      );
    });

    it("throws when keypairTTL is NaN", ({ createSDK }) => {
      expect(() => createSDK({ keypairTTL: NaN })).toThrow(
        "keypairTTL must be a positive number (seconds)",
      );
    });

    it("accepts keypairTTL exactly at the 365-day maximum without warning", ({ createSDK }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MAX = 365 * 86400;
      const sdk = createSDK({ keypairTTL: MAX });
      expect(sdk.credentials!.keypairTTL).toBe(MAX);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("caps keypairTTL above 365 days and emits a warning", ({ createSDK }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MAX = 365 * 86400;
      const TOO_BIG = MAX + 1;
      const sdk = createSDK({ keypairTTL: TOO_BIG });
      expect(sdk.credentials.keypairTTL).toBe(MAX);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain("keypairTTL");
      expect(warnSpy.mock.calls[0][0]).toContain("365 days");
      warnSpy.mockRestore();
    });

    it("caps keypairTTL: Infinity to the 365-day maximum and emits a warning", ({ createSDK }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const MAX = 365 * 86400;
      const sdk = createSDK({ keypairTTL: Infinity });
      expect(sdk.credentials!.keypairTTL).toBe(MAX);
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });
  });

  describe("lifecycle auto-revoke", () => {
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

    it("logs cleanup warnings and clears cache when revoke fails", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

      vi.spyOn(sessionStorage, "delete").mockRejectedValueOnce(new Error("session blew up"));
      const clearSpy = vi.spyOn(sdk.cache, "clearForRequester").mockResolvedValueOnce(undefined);
      const listener = vi.fn();
      sdk.onIdentityChange(listener);

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: undefined,
      });

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("revoke previous identity failed"),
          expect.any(Error),
        );
      });
      expect(clearSpy).toHaveBeenCalledWith(userAddress);
      expect(listener).toHaveBeenCalledWith({
        previous: { address: userAddress, chainId: 31337 },
        next: undefined,
      });

      warnSpy.mockRestore();
    });

    it("initial identity discovery does not revoke sessions or clear cache", async ({
      createMockSigner,
      createSDK,
      handle,
      tokenAddress,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(keyA, "0xsigA");
      await sdk.cache.set(userAddress, tokenAddress, handle, 123n);

      emitChange({
        previous: undefined,
        next: { address: userAddress, chainId: 31337 },
      });

      await Promise.resolve();
      expect(await sessionStorage.get(keyA)).toBe("0xsigA");
      expect(await sdk.cache.get(userAddress, tokenAddress, handle)).toBe(123n);

      sdk.terminate();
    });

    it("clears only the previous requester's decrypt cache on identity change", async ({
      createMockSigner,
      createSDK,
      handle,
      tokenAddress,
      userAddress,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

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

    it("accountChange revokes the PREVIOUS account session, not the new one", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(keyA, "0xsigA");

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: { address: NEXT_USER_ADDRESS, chainId: 31337 },
      });

      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      const keyB = await CredentialsManager.computeStoreKey(NEXT_USER_ADDRESS, 31337);
      expect(await sessionStorage.get(keyB)).toBeNull();

      sdk.terminate();
    });

    it("A→B→A: both account sessions are revoked on their respective switches", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      const keyB = await CredentialsManager.computeStoreKey(NEXT_USER_ADDRESS, 31337);

      await sessionStorage.set(keyA, "0xsigA");

      // Switch A → B
      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: { address: NEXT_USER_ADDRESS, chainId: 31337 },
      });
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      // B gets a session
      await sessionStorage.set(keyB, "0xsigB");

      // Switch B → A
      emitChange({
        previous: { address: NEXT_USER_ADDRESS, chainId: 31337 },
        next: { address: userAddress, chainId: 31337 },
      });
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyB)).toBeNull();
      });

      sdk.terminate();
    });

    it("disconnect revokes the current account session", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({
        signer,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(keyA, "0xsigA");

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: undefined,
      });

      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      sdk.terminate();
    });

    it("chainChange revokes the previous chain session and tracks the new chain", async ({
      createMockSigner,
      createMockProvider,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner(userAddress));

      const mockProvider = createMockProvider();
      const sdk = createSDK({
        provider: mockProvider,
        signer,
      });

      const oldKey = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(oldKey, "0xsigA");

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: { address: userAddress, chainId: 1 },
      });

      await vi.waitFor(async () => {
        expect(await sessionStorage.get(oldKey)).toBeNull();
      });

      // Align both signer and provider to the new chain before calling revokeSession
      (signer.getChainId as Mock).mockResolvedValue(1);
      (mockProvider.getChainId as Mock).mockResolvedValue(1);
      const newKey = await CredentialsManager.computeStoreKey(userAddress, 1);
      await sessionStorage.set(newKey, "0xsigB");

      await sdk.revokeSession();

      expect(await sessionStorage.get(newKey)).toBeNull();

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

      // Reset and set up for handle2 only
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });

      // Second call with both — only handle2 should go to relayer
      const result = await sdk.userDecrypt([
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_A },
      ]);
      expect(result[handle2]).toBe(2000n);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);

      // Verify only handle2 was sent in the second call
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

    it("DecryptStart/End handles contain only uncached handles", async ({
      createSDK,
      relayer,
      handle,
    }) => {
      const events: { type: string; handles?: Handle[] }[] = [];
      const handle2 = ("0x" + "cd".repeat(32)) as Handle;
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      // Prime the cache for `handle`
      await sdk.userDecrypt([{ handle, contractAddress: CONTRACT_A }]);
      events.length = 0;

      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });
      await sdk.userDecrypt([
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_A },
      ]);

      const start = events.find((e) => e.type === ZamaSDKEvents.DecryptStart);
      const end = events.find((e) => e.type === ZamaSDKEvents.DecryptEnd);
      expect(start?.handles).toEqual([handle2]);
      expect(end?.handles).toEqual([handle2]);
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
      const allowSpy = vi.spyOn(sdk.credentials!, "allow");

      // Second call: handle is cached, handle2 is not — both contracts should be in allow()
      vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({
        [handle2]: 2000n,
      });

      await sdk.userDecrypt([
        { handle, contractAddress: CONTRACT_A },
        { handle: handle2, contractAddress: CONTRACT_B },
      ]);

      expect(allowSpy).toHaveBeenCalledOnce();
      const allowArgs = allowSpy.mock.calls[0]!;
      // Both contract addresses should be present (checksummed via getAddress)
      expect(allowArgs).toHaveLength(2);
    });
  });

  describe("delegatedUserDecrypt", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;
    const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

    it("decrypts handles via relayer and caches results", async ({ sdk, relayer, handle }) => {
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

    it("skips already-cached handles", async ({ sdk, relayer, handle }) => {
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

    it("uses delegateAddress for cache key when provided", async ({ sdk, relayer, handle }) => {
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

    it("does not emit events for fully-cached calls", async ({ createSDK, handle }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);

      events.length = 0;
      await sdk.delegatedUserDecrypt([{ handle, contractAddress: CONTRACT_A }], DELEGATOR);
      expect(events.filter((e) => e.type === ZamaSDKEvents.DecryptStart)).toHaveLength(0);
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

    it("delegates to credentials.allow, forwarding addresses as-is", async ({ sdk }) => {
      const allowSpy = vi.spyOn(sdk.credentials!, "allow");
      await sdk.allow([CONTRACT_A, CONTRACT_B]);
      // credentials.allow owns normalization — sdk.allow is just a thin forwarder.
      expect(allowSpy).toHaveBeenCalledWith(CONTRACT_A, CONTRACT_B);
    });

    it("returns immediately for empty array without calling credentials.allow", async ({ sdk }) => {
      const allowSpy = vi.spyOn(sdk.credentials!, "allow");
      await sdk.allow([]);
      expect(allowSpy).not.toHaveBeenCalled();
    });
  });

  describe("revoke clears decrypt cache", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("credentials.revoke() + cache clear — decrypt after revoke hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.credentials!.revoke();
      const address = await sdk.signer!.getAddress();
      await sdk.cache.clearForRequester(address);

      // After revoke, cache should be cleared — relayer called again
      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("revokeSession() clears cache — decrypt after revokeSession hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revokeSession();

      // After revokeSession, cache should be cleared — relayer called again
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

  describe("isAllowed", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("delegates to credentials.isAllowed with the given addresses", async ({ sdk }) => {
      const isAllowedSpy = vi.spyOn(sdk.credentials!, "isAllowed").mockResolvedValueOnce(true);
      await expect(sdk.isAllowed([CONTRACT_A, CONTRACT_B])).resolves.toBe(true);
      expect(isAllowedSpy).toHaveBeenCalledWith([CONTRACT_A, CONTRACT_B]);
    });

    it("throws ConfigurationError on empty array", async ({ sdk }) => {
      await expect(sdk.isAllowed([])).rejects.toBeInstanceOf(ConfigurationError);
    });

    it("throws SignerRequiredError when no signer is configured", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.isAllowed([CONTRACT_A])).rejects.toBeInstanceOf(SignerRequiredError);
    });
  });

  describe("revokeCredentials", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("delegates to credentials.revoke, forwarding rest args", async ({ sdk }) => {
      const revokeSpy = vi.spyOn(sdk.credentials!, "revoke");
      await sdk.revokeCredentials(CONTRACT_A, CONTRACT_B);
      expect(revokeSpy).toHaveBeenCalledWith(CONTRACT_A, CONTRACT_B);
    });

    it("calls credentials.revoke() with no arguments to revoke whole session", async ({ sdk }) => {
      const revokeSpy = vi.spyOn(sdk.credentials!, "revoke");
      await sdk.revokeCredentials();
      expect(revokeSpy).toHaveBeenCalledWith();
    });

    it("throws SignerRequiredError when no signer is configured", async ({ createSDK }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(sdk.revokeCredentials(CONTRACT_A)).rejects.toBeInstanceOf(SignerRequiredError);
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
      const signerAddress = await signer.getAddress();
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

    it("throws SignerRequiredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerRequiredError);
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

    it("throws SignerRequiredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerRequiredError);
    });
  });
});
