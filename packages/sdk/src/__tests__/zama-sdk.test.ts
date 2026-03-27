import { describe, it, expect, vi, type Mock } from "../test-fixtures";
import { ZamaSDK } from "../zama-sdk";
import { loadCachedUserDecryption, saveCachedUserDecryption } from "../decrypt-cache";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import { CredentialsManager } from "../credentials/credentials-manager";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { SignerLifecycleCallbacks } from "../types";
import type { Address } from "viem";

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

  it("userDecrypt caches decrypted handles", async ({ relayer, signer, storage, tokenAddress }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const handle = ("0x" + "01".repeat(32)) as Address;

    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handle]: 42n });

    const result = await sdk.userDecrypt([{ handle, contractAddress: tokenAddress }]);

    expect(result).toEqual({ [handle]: 42n });
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    expect(
      await loadCachedUserDecryption(storage, await signer.getAddress(), tokenAddress, handle),
    ).toBe(42n);
  });

  it("userDecrypt keeps same-handle cache entries isolated by contract", async ({
    relayer,
    signer,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const handle = ("0x" + "02".repeat(32)) as Address;
    const contractA = "0x1111111111111111111111111111111111111111" as Address;
    const contractB = "0x2222222222222222222222222222222222222222" as Address;

    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [handle]: 10n })
      .mockResolvedValueOnce({ [handle]: 20n });

    expect(await sdk.userDecrypt([{ handle, contractAddress: contractA }])).toEqual({
      [handle]: 10n,
    });
    expect(await sdk.userDecrypt([{ handle, contractAddress: contractB }])).toEqual({
      [handle]: 20n,
    });

    expect(
      await loadCachedUserDecryption(storage, await signer.getAddress(), contractA, handle),
    ).toBe(10n);
    expect(
      await loadCachedUserDecryption(storage, await signer.getAddress(), contractB, handle),
    ).toBe(20n);
    expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
  });

  it("userDecrypt normalizes contract addresses before grouping", async ({
    relayer,
    storage,
    createMockSigner,
  }) => {
    const signer = createMockSigner();
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const handleA = ("0x" + "03".repeat(32)) as Address;
    const handleB = ("0x" + "04".repeat(32)) as Address;
    const lower = "0x52908400098527886e0f7030069857d2e4169ee7" as Address;
    const upper = "0x52908400098527886E0F7030069857D2E4169EE7" as Address;

    vi.mocked(relayer.userDecrypt).mockResolvedValueOnce({ [handleA]: 10n, [handleB]: 20n });

    const result = await sdk.userDecrypt([
      { handle: handleA, contractAddress: lower },
      { handle: handleB, contractAddress: upper },
    ]);

    expect(result).toEqual({ [handleA]: 10n, [handleB]: 20n });
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: "0x52908400098527886E0F7030069857D2E4169EE7",
        handles: [handleA, handleB],
      }),
    );
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

  it("revoke clears session storage", async ({ signer, relayer, storage, sessionStorage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage, sessionStorage });

    // Simulate a cached session signature by computing the same store key
    // the CredentialsManager uses.
    const address = await signer.getAddress();
    const chainId = await signer.getChainId();
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);

    await sessionStorage.set(storeKey, "0xsomeSignature");
    expect(await sessionStorage.get(storeKey)).toBe("0xsomeSignature");

    await sdk.revoke();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  it("revoke clears cached decryptions for the current requester", async ({
    signer,
    relayer,
    storage,
    tokenAddress,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const handle = ("0x" + "03".repeat(32)) as Address;
    const otherHandle = ("0x" + "13".repeat(32)) as Address;
    const requester = await signer.getAddress();
    const otherTokenAddress = "0x3333333333333333333333333333333333333333" as Address;

    await saveCachedUserDecryption(storage, requester, tokenAddress, handle, 99n);
    await saveCachedUserDecryption(storage, requester, otherTokenAddress, otherHandle, 199n);
    expect(await loadCachedUserDecryption(storage, requester, tokenAddress, handle)).toBe(99n);
    expect(await loadCachedUserDecryption(storage, requester, otherTokenAddress, otherHandle)).toBe(
      199n,
    );

    await sdk.revoke(tokenAddress);

    expect(await loadCachedUserDecryption(storage, requester, tokenAddress, handle)).toBeNull();
    expect(await loadCachedUserDecryption(storage, requester, otherTokenAddress, otherHandle)).toBe(
      199n,
    );
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

  it("revokeSession clears cached decryptions for the tracked requester", async ({
    signer,
    relayer,
    storage,
    tokenAddress,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const handle = ("0x" + "04".repeat(32)) as Address;
    const requester = await signer.getAddress();

    await saveCachedUserDecryption(storage, requester, tokenAddress, handle, 123n);
    expect(await loadCachedUserDecryption(storage, requester, tokenAddress, handle)).toBe(123n);

    await sdk.revokeSession();

    expect(await loadCachedUserDecryption(storage, requester, tokenAddress, handle)).toBeNull();
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
      const oldHandle = ("0x" + "21".repeat(32)) as Address;
      const newHandle = ("0x" + "22".repeat(32)) as Address;
      await saveCachedUserDecryption(
        storage,
        userAddress,
        "0x1111111111111111111111111111111111111111",
        oldHandle,
        1n,
      );
      await saveCachedUserDecryption(
        storage,
        NEXT_USER_ADDRESS,
        "0x2222222222222222222222222222222222222222",
        newHandle,
        2n,
      );

      // Simulate account change: signer now reports account B
      (signer.getAddress as Mock).mockResolvedValue(NEXT_USER_ADDRESS);

      // Trigger the lifecycle callback with the NEW address
      subscribeCbs!.onAccountChange(NEXT_USER_ADDRESS);

      // Wait for async revoke to complete
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });
      await vi.waitFor(async () => {
        expect(
          await loadCachedUserDecryption(
            storage,
            userAddress,
            "0x1111111111111111111111111111111111111111",
            oldHandle,
          ),
        ).toBeNull();
      });

      // Account B's key should be untouched (it was never seeded)
      const keyB = await CredentialsManager.computeStoreKey(NEXT_USER_ADDRESS, 31337);
      expect(await sessionStorage.get(keyB)).toBeNull();
      expect(
        await loadCachedUserDecryption(
          storage,
          NEXT_USER_ADDRESS,
          "0x2222222222222222222222222222222222222222",
          newHandle,
        ),
      ).toBe(2n);

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
      const handle = ("0x" + "23".repeat(32)) as Address;
      await saveCachedUserDecryption(
        storage,
        userAddress,
        "0x1111111111111111111111111111111111111111",
        handle,
        3n,
      );

      // Signer may throw on getAddress after disconnect
      (signer.getAddress as Mock).mockRejectedValue(new Error("disconnected"));

      subscribeCbs!.onDisconnect();
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });
      await vi.waitFor(async () => {
        expect(
          await loadCachedUserDecryption(
            storage,
            userAddress,
            "0x1111111111111111111111111111111111111111",
            handle,
          ),
        ).toBeNull();
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
});
