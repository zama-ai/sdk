import { describe, it, expect, vi, type Mock } from "../../test-fixtures";
import { ZamaSDK } from "../zama-sdk";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import { computeStoreKey } from "../credentials-manager";
import type { SignerLifecycleCallbacks } from "../token.types";
import type { Address } from "../../relayer/relayer-sdk.types";

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

  it("creates distinct instances per address", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    const t1 = sdk.createReadonlyToken("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address);
    const t2 = sdk.createReadonlyToken("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(t2.address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("terminate delegates to relayer.terminate", ({ relayer, signer, storage }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage });
    sdk.terminate();
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
    // the CredentialsManager uses (SHA-256 of "address:chainId", first 32 hex chars).
    const address = (await signer.getAddress()).toLowerCase();
    const chainId = await signer.getChainId();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${address}:${chainId}`),
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const storeKey = hex.slice(0, 32);

    await sessionStorage.set(storeKey, "0xsomeSignature");
    expect(await sessionStorage.get(storeKey)).toBe("0xsomeSignature");

    await sdk.revoke();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  it("revokeSession clears session storage", async ({
    signer,
    relayer,
    storage,
    sessionStorage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage, sessionStorage });

    const address = (await signer.getAddress()).toLowerCase();
    const chainId = await signer.getChainId();
    const storeKey = await computeStoreKey(address, chainId);

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

    expect(events).toContainEqual(expect.objectContaining({ type: "credentials:revoked" }));
  });

  describe("lifecycle auto-revoke", () => {
    it("onAccountChange revokes the PREVIOUS account session, not the new one", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner("0xuser" as Address);
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
      const keyA = await computeStoreKey("0xuser", 31337);
      await sessionStorage.set(keyA, "0xsigA");

      // Simulate account change: signer now reports account B
      (signer.getAddress as Mock).mockResolvedValue("0xnewuser");

      // Trigger the lifecycle callback with the NEW address
      subscribeCbs!.onAccountChange("0xnewuser");

      // Wait for async revoke to complete
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      // Account B's key should be untouched (it was never seeded)
      const keyB = await computeStoreKey("0xnewuser", 31337);
      expect(await sessionStorage.get(keyB)).toBeNull();

      sdk.terminate();
    });

    it("A→B→A: both account sessions are revoked on their respective switches", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner("0xuser" as Address);
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

      const keyA = await computeStoreKey("0xuser", 31337);
      const keyB = await computeStoreKey("0xnewuser", 31337);

      // A has a session
      await sessionStorage.set(keyA, "0xsigA");

      // Switch A → B
      (signer.getAddress as Mock).mockResolvedValue("0xnewuser");
      subscribeCbs!.onAccountChange("0xnewuser");
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      // B gets a session
      await sessionStorage.set(keyB, "0xsigB");

      // Switch B → A
      (signer.getAddress as Mock).mockResolvedValue("0xuser");
      subscribeCbs!.onAccountChange("0xuser");
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyB)).toBeNull();
      });

      sdk.terminate();
    });

    it("onDisconnect revokes the current account session", async ({
      createMockRelayer,
      createMockSigner,
      storage,
      sessionStorage,
    }) => {
      let subscribeCbs: Required<SignerLifecycleCallbacks>;

      const mockSigner = createMockSigner("0xuser" as Address);
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

      const keyA = await computeStoreKey("0xuser", 31337);
      await sessionStorage.set(keyA, "0xsigA");

      // Signer may throw on getAddress after disconnect
      (signer.getAddress as Mock).mockRejectedValue(new Error("disconnected"));

      subscribeCbs!.onDisconnect();
      await vi.waitFor(async () => {
        expect(await sessionStorage.get(keyA)).toBeNull();
      });

      sdk.terminate();
    });
  });
});
