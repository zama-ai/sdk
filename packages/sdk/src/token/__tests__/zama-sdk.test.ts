import { describe, it, expect, vi, type Mock } from "vitest";
import { ZamaSDK } from "../zama-sdk";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import { MemoryStorage } from "../memory-storage";
import { computeStoreKey } from "../credentials-manager";
import type { GenericSigner } from "../token.types";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";

function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue("0xuser"),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

function createMockRelayer(): RelayerSDK {
  return {
    generateKeypair: vi.fn(),
    createEIP712: vi.fn(),
    encrypt: vi.fn(),
    userDecrypt: vi.fn(),
    publicDecrypt: vi.fn(),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn(),
    getPublicParams: vi.fn(),
    terminate: vi.fn(),
  };
}

describe("ZamaSDK", () => {
  const storage = new MemoryStorage();
  const signer = createMockSigner();
  const relayer = createMockRelayer();

  const sdk = new ZamaSDK({
    relayer,
    signer,
    storage,
  });

  it("exposes signer and storage", () => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", () => {
    const token = sdk.createReadonlyToken("0x1111111111111111111111111111111111111111" as Address);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe("0x1111111111111111111111111111111111111111");
    expect(token.signer).toBe(signer);
  });

  it("createToken returns Token", () => {
    const token = sdk.createToken("0x1111111111111111111111111111111111111111" as Address);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe("0x1111111111111111111111111111111111111111");
  });

  it("creates distinct instances per address", () => {
    const t1 = sdk.createReadonlyToken("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address);
    const t2 = sdk.createReadonlyToken("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(t2.address).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("terminate delegates to relayer.terminate", () => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("calls signer.subscribe when available", () => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdkWithSubscribe = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: subscribeSigner,
      storage: new MemoryStorage(),
    });

    expect(subscribeSigner.subscribe).toHaveBeenCalledOnce();
    expect(subscribeSigner.subscribe).toHaveBeenCalledWith({
      onDisconnect: expect.any(Function),
      onAccountChange: expect.any(Function),
    });

    // Cleanup
    sdkWithSubscribe.terminate();
  });

  it("terminate calls unsubscribe from signer.subscribe", () => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const sdkWithSubscribe = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: subscribeSigner,
      storage: new MemoryStorage(),
    });

    sdkWithSubscribe.terminate();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not fail when signer.subscribe is undefined", () => {
    const plainSigner = createMockSigner();
    expect(plainSigner.subscribe).toBeUndefined();

    const sdkNoSubscribe = new ZamaSDK({
      relayer: createMockRelayer(),
      signer: plainSigner,
      storage: new MemoryStorage(),
    });

    // Should not throw
    sdkNoSubscribe.terminate();
  });

  it("revokeSession clears session storage", async () => {
    const sessionStorage = new MemoryStorage();
    const localSigner = createMockSigner();
    const localRelayer = createMockRelayer();

    const localSdk = new ZamaSDK({
      relayer: localRelayer,
      signer: localSigner,
      storage: new MemoryStorage(),
      sessionStorage,
    });

    // Simulate a cached session signature by computing the same store key
    // the CredentialsManager uses (SHA-256 of "address:chainId", first 32 hex chars).
    const address = (await localSigner.getAddress()).toLowerCase();
    const chainId = await localSigner.getChainId();
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

    await localSdk.revokeSession();

    expect(await sessionStorage.get(storeKey)).toBeNull();
  });

  describe("lifecycle auto-revoke", () => {
    it("onAccountChange revokes the PREVIOUS account session, not the new one", async () => {
      const sessionStorage = new MemoryStorage();
      let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: Record<string, unknown>) => {
          subscribeCbs = cbs as unknown as typeof subscribeCbs;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage: new MemoryStorage(),
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

    it("A→B→A: both account sessions are revoked on their respective switches", async () => {
      const sessionStorage = new MemoryStorage();
      let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: Record<string, unknown>) => {
          subscribeCbs = cbs as unknown as typeof subscribeCbs;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage: new MemoryStorage(),
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

    it("onDisconnect revokes the current account session", async () => {
      const sessionStorage = new MemoryStorage();
      let subscribeCbs: { onDisconnect: () => void; onAccountChange: (addr: string) => void };

      const mockSigner = createMockSigner();
      const signer = {
        ...mockSigner,
        subscribe: vi.fn((cbs: Record<string, unknown>) => {
          subscribeCbs = cbs as unknown as typeof subscribeCbs;
          return () => {};
        }),
      };

      const sdk = new ZamaSDK({
        relayer: createMockRelayer(),
        signer,
        storage: new MemoryStorage(),
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
