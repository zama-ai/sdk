import { describe, it, expect, vi, type Mock, TEST_ADDR_B } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { CredentialsManager } from "../credentials/credentials-manager";
import type { ZamaError } from "../errors";
import { DecryptionFailedError, EncryptionFailedError, ZamaErrorCode } from "../errors";
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

    await sdk.credentials.revoke();

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
      expect(sdk.credentials.keypairTTL).toBe(MAX);
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
      expect(sdk.credentials.keypairTTL).toBe(MAX);
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

    it("logs a warning when core cleanup fails, without breaking event delivery", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({ signer });

      vi.spyOn(sessionStorage, "delete").mockRejectedValueOnce(new Error("session blew up"));
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
      expect(listener).toHaveBeenCalledWith({
        previous: { address: userAddress, chainId: 31337 },
        next: undefined,
      });

      warnSpy.mockRestore();
    });

    it("initial identity discovery does not revoke sessions or clear cache", async ({
      handle,
      createMockSigner,
      createSDK,
      tokenAddress,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({ signer });

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
      handle,
      createMockSigner,
      createSDK,
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

    it("accountChange revokes the PREVIOUS account session, not the new one", async ({
      createMockSigner,
      createSDK,
      userAddress,
      sessionStorage,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({ signer });

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

      const sdk = createSDK({ signer });

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

      const sdk = createSDK({ signer });

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
      const sdk = createSDK({ signer, provider: mockProvider });

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
      const allowSpy = vi.spyOn(sdk.credentials, "allow");

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

  describe("encrypt", () => {
    const CONTRACT = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const USER_ADDR = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

    it("delegates to relayer.encrypt and returns the result", async ({ sdk, relayer }) => {
      const params = {
        values: [{ value: 1000n, type: "euint64" as const }],
        contractAddress: CONTRACT,
        userAddress: USER_ADDR,
      };

      const result = await sdk.encrypt(params);
      expect(relayer.encrypt).toHaveBeenCalledWith(params);
      expect(result).toEqual({
        handles: [new Uint8Array([1, 2, 3])],
        inputProof: new Uint8Array([4, 5, 6]),
      });
    });

    it("emits EncryptStart and EncryptEnd events", async ({ createSDK }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.encrypt({
        values: [{ value: 1n, type: "euint64" }],
        contractAddress: CONTRACT,
        userAddress: USER_ADDR,
      });

      expect(events).toContainEqual(expect.objectContaining({ type: ZamaSDKEvents.EncryptStart }));
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptEnd,
          durationMs: expect.any(Number),
        }),
      );
    });

    it("emits EncryptError event on failure and wraps the error", async ({
      createSDK,
      relayer,
    }) => {
      const events: { type: string }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("wasm blew up"));

      await expect(
        sdk.encrypt({
          values: [{ value: 1n, type: "euint64" }],
          contractAddress: CONTRACT,
          userAddress: USER_ADDR,
        }),
      ).rejects.toThrow(EncryptionFailedError);

      expect(events).toContainEqual(expect.objectContaining({ type: ZamaSDKEvents.EncryptStart }));
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptError,
          durationMs: expect.any(Number),
        }),
      );
    });

    it("wraps non-ZamaError in EncryptionFailedError", async ({ sdk, relayer }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(
        sdk.encrypt({
          values: [{ value: 1n, type: "euint64" }],
          contractAddress: CONTRACT,
          userAddress: USER_ADDR,
        }),
      ).rejects.toSatisfy((err: ZamaError) => {
        return err instanceof EncryptionFailedError && err.code === ZamaErrorCode.EncryptionFailed;
      });
    });

    it("re-throws ZamaError as-is", async ({ sdk, relayer }) => {
      const original = new EncryptionFailedError("already typed");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(
        sdk.encrypt({
          values: [{ value: 1n, type: "euint64" }],
          contractAddress: CONTRACT,
          userAddress: USER_ADDR,
        }),
      ).rejects.toBe(original);
    });
  });

  describe("allow", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("delegates to credentials.allow, forwarding addresses as-is", async ({ sdk }) => {
      const allowSpy = vi.spyOn(sdk.credentials, "allow");
      await sdk.allow([CONTRACT_A, CONTRACT_B]);
      // credentials.allow owns normalization — sdk.allow is just a thin forwarder.
      expect(allowSpy).toHaveBeenCalledWith(CONTRACT_A, CONTRACT_B);
    });

    it("returns immediately for empty array without calling credentials.allow", async ({ sdk }) => {
      const allowSpy = vi.spyOn(sdk.credentials, "allow");
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

      await sdk.credentials.revoke();
      const address = await sdk.signer.getAddress();
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
});
