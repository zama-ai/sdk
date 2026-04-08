import { describe, it, expect, vi, type Mock } from "../test-fixtures";
import { ZamaSDK } from "../zama-sdk";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { CredentialsManager } from "../credentials/credentials-manager";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { SignerLifecycleCallbacks } from "../types";
import type { Address } from "viem";
import type { DecryptHandle } from "../query/user-decrypt";

const NEXT_USER_ADDRESS = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

describe("ZamaSDK", () => {
  it("exposes signer and storage", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", ({ relayer, signer, storage, tokenAddress }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const token = sdk.createReadonlyToken(tokenAddress);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe(tokenAddress);
    expect(token.signer).toBe(sdk.signer);
  });

  it("createToken returns Token", ({ relayer, signer, storage, tokenAddress }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
  });

  for (const method of ["createToken", "createReadonlyToken"] as const) {
    it(`${method} shares delegatedCredentials with the SDK`, ({
      relayer,
      signer,
      storage,
      tokenAddress,
    }) => {
      const sdk = new ZamaSDK({ relayer, signer, storage });
      const token = sdk[method](tokenAddress);
      expect((token as unknown as { delegatedCredentials: unknown }).delegatedCredentials).toBe(
        sdk.delegatedCredentials,
      );
    });
  }

  it("creates distinct instances per address", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const t1 = sdk.createReadonlyToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createReadonlyToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(t2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  it("terminate delegates to relayer.terminate", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("[Symbol.dispose] delegates to terminate", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    sdk[Symbol.dispose]();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("calls signer.subscribe when available", ({
    createMockSigner,
    createMockRelayer,
    storage,
  }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: subscribeSigner,
      storage,
    });

    expect(subscribeSigner.subscribe).toHaveBeenCalledOnce();
    expect(subscribeSigner.subscribe).toHaveBeenCalledWith({
      onDisconnect: expect.any(Function),
      onAccountChange: expect.any(Function),
      onChainChange: expect.any(Function),
    });

    sdk.terminate();
  });

  it("terminate calls unsubscribe from signer.subscribe", ({
    createMockRelayer,
    createMockSigner,
    storage,
  }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdk = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: subscribeSigner,
      storage,
    });

    sdk.terminate();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not fail when subscribe returns a no-op unsubscribe", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    // Should not throw
    sdk.terminate();
  });

  it("credentials.revoke clears session storage", async ({
    signer,
    relayer,
    storage,
    sessionStorage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage, sessionStorage });

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

  it("revokeSession clears session storage", async ({
    signer,
    relayer,
    storage,
    sessionStorage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage, sessionStorage });

    const address = await signer.getAddress();
    const chainId = await signer.getChainId();
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);

    await sessionStorage.set(storeKey, "0xsomeSignature");
    expect(await sessionStorage.get(storeKey)).toBe("0xsomeSignature");

    await sdk.revokeSession();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  it("revokeSession emits CredentialsRevoked event", async ({ relayer, signer, storage }) => {
    const events: { type: string }[] = [];
    const sdk = new ZamaSDK({
      relayer,
      signer,
      storage,
      onEvent: (e) => events.push(e),
    });

    await sdk.revokeSession();

    expect(events).toContainEqual(
      expect.objectContaining({ type: ZamaSDKEvents.CredentialsRevoked }),
    );
  });

  it("revokeSession calls clearCaches on credentials manager", async ({
    relayer,
    signer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const clearCachesSpy = vi.spyOn(sdk.credentials, "clearCaches" as never);

    await sdk.revokeSession();

    expect(clearCachesSpy).toHaveBeenCalledOnce();
  });

  describe("lifecycle auto-revoke", () => {
    it("onDisconnect emits TransactionError when the composed lifecycle callback throws", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;
      const events: { type: string; operation?: string }[] = [];

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
        onEvent: (event) => events.push(event),
        signerLifecycleCallbacks: {
          onDisconnect: () => {
            throw new Error("disconnect callback failed");
          },
          onAccountChange: () => {
            throw new Error("account callback failed");
          },
          onChainChange: () => {
            throw new Error("chain callback failed");
          },
        },
      });

      subscribeCbs!.onDisconnect();

      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({
            type: ZamaSDKEvents.TransactionError,
            operation: "signerDisconnect",
          }),
        );
      });
    });

    it("onAccountChange emits TransactionError when the composed lifecycle callback throws", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;
      const events: { type: string; operation?: string }[] = [];

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
        onEvent: (event) => events.push(event),
        signerLifecycleCallbacks: {
          onDisconnect: () => {
            throw new Error("disconnect callback failed");
          },
          onAccountChange: () => {
            throw new Error("account callback failed");
          },
          onChainChange: () => {
            throw new Error("chain callback failed");
          },
        },
      });

      subscribeCbs!.onAccountChange(NEXT_USER_ADDRESS);

      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({
            type: ZamaSDKEvents.TransactionError,
            operation: "signerAccountChange",
          }),
        );
      });
    });

    it("onChainChange emits TransactionError when the composed lifecycle callback throws", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;
      const events: { type: string; operation?: string }[] = [];

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
        onEvent: (event) => events.push(event),
        signerLifecycleCallbacks: {
          onDisconnect: () => {
            throw new Error("disconnect callback failed");
          },
          onAccountChange: () => {
            throw new Error("account callback failed");
          },
          onChainChange: () => {
            throw new Error("chain callback failed");
          },
        },
      });

      subscribeCbs!.onChainChange(1);

      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({
            type: ZamaSDKEvents.TransactionError,
            operation: "signerChainChange",
          }),
        );
      });
    });

    it("onDisconnect calls clearCaches on credentials manager", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      const clearCachesSpy = vi.spyOn(sdk.credentials, "clearCaches" as never);

      subscribeCbs!.onDisconnect();

      await vi.waitFor(() => {
        expect(clearCachesSpy).toHaveBeenCalledOnce();
      });

      sdk.terminate();
    });

    it("onAccountChange calls clearCaches on credentials manager", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      const clearCachesSpy = vi.spyOn(sdk.credentials, "clearCaches" as never);

      subscribeCbs!.onAccountChange(NEXT_USER_ADDRESS);

      await vi.waitFor(() => {
        expect(clearCachesSpy).toHaveBeenCalledOnce();
      });

      sdk.terminate();
    });

    it("onAccountChange revokes the PREVIOUS account session, not the new one", async ({
      createMockRelayer,
      createMockSigner,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      // Seed account A's session
      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(keyA, "0xsigA");

      // Simulate account change: signer now reports account B
      (signer.getAddress as Mock).mockResolvedValue(NEXT_USER_ADDRESS);

      // Trigger the lifecycle callback with the NEW address
      subscribeCbs!.onAccountChange(NEXT_USER_ADDRESS);

      // Wait for async revoke to complete
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      // Account B's key should be untouched (it was never seeded)
      const keyB = await CredentialsManager.computeStoreKey(NEXT_USER_ADDRESS, 31337);
      expect(await sessionStorage.get(keyB)).toBeNull();

      sdk.terminate();
    });

    it("A→B→A: both account sessions are revoked on their respective switches", async ({
      createMockRelayer,
      createMockSigner,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      const keyB = await CredentialsManager.computeStoreKey(NEXT_USER_ADDRESS, 31337);

      // A has a session
      await sessionStorage.set(keyA, "0xsigA");

      // Switch A → B
      (signer.getAddress as Mock).mockResolvedValue(NEXT_USER_ADDRESS);
      subscribeCbs!.onAccountChange(NEXT_USER_ADDRESS);
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      // B gets a session
      await sessionStorage.set(keyB, "0xsigB");

      // Switch B → A
      (signer.getAddress as Mock).mockResolvedValue(userAddress);
      subscribeCbs!.onAccountChange(userAddress);
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyB)).toBeNull();
      });

      sdk.terminate();
    });

    it("onDisconnect revokes the current account session", async ({
      createMockRelayer,
      createMockSigner,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      const keyA = await CredentialsManager.computeStoreKey(userAddress, 31337);
      await sessionStorage.set(keyA, "0xsigA");

      // Signer may throw on getAddress after disconnect
      (signer.getAddress as Mock).mockRejectedValue(new Error("disconnected"));

      subscribeCbs!.onDisconnect();
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      sdk.terminate();
    });

    it("onChainChange revokes the previous chain session and tracks the new chain", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: SignerLifecycleCallbacks) => {
          subscribeCbs = cbs as Required<SignerLifecycleCallbacks>;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage,
        sessionStorage,
      });

      const oldKey = await CredentialsManager.computeStoreKey(
        "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
        31337,
      );
      await sessionStorage.set(oldKey, "0xsigA");

      subscribeCbs!.onChainChange(1);

      await vi.waitFor(async () => {
        expect(await sessionStorage.get(oldKey)).toBeNull();
      });

      (signer.getChainId as Mock).mockResolvedValue(1);
      const newKey = await CredentialsManager.computeStoreKey(
        "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
        1,
      );
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
  });

  describe("revoke clears decrypt cache", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("revoke() clears cache — decrypt after revoke hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revoke();

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
