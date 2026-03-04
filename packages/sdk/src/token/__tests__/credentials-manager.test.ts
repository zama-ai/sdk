import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialsManager, computeStoreKey } from "../credentials-manager";
import { MemoryStorage } from "../memory-storage";
import { ZamaError, ZamaErrorCode } from "../token.types";
import { CredentialExpiredError } from "../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { createMockRelayer, createMockSigner } from "./test-helpers";

describe("CredentialsManager", () => {
  let sdk: RelayerSDK;
  let signer: ReturnType<typeof createMockSigner>;
  let store: MemoryStorage;
  let manager: CredentialsManager;
  let storeKey: string;

  beforeEach(async () => {
    sdk = createMockRelayer({
      generateKeypair: vi.fn().mockResolvedValue({
        publicKey: "0xpub123",
        privateKey: "0xpriv456",
      }),
    });
    signer = createMockSigner("0xuser" as Address, {
      signTypedData: vi.fn().mockResolvedValue("0xsig789"),
    });
    store = new MemoryStorage();
    manager = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 1,
    });
    storeKey = await computeStoreKey(await signer.getAddress(), 31337);
  });

  it("generates new credentials on first call", async () => {
    const creds = await manager.allow("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    expect(sdk.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");
    expect(creds.privateKey).toBe("0xpriv456");
    expect(creds.signature).toBe("0xsig789");
  });

  it("returns cached credentials on second call with same contracts", async () => {
    await manager.allow("0xtoken" as Address);
    await manager.allow("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("re-signs when new contract not in signed list", async () => {
    await manager.allow("0xtoken1" as Address);
    await manager.allow("0xtoken1" as Address, "0xtoken2" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("persists credentials to store with hashed key", async () => {
    await manager.allow("0xtoken" as Address);

    const stored = await store.get(storeKey);
    expect(stored).not.toBeNull();
    const parsed = stored as Record<string, unknown>;
    expect(parsed.publicKey).toBe("0xpub123");
    // Signature should NOT be persisted (session-scoped only)
    expect(parsed.signature).toBeUndefined();
  });

  it("does not store the full address as key", async () => {
    await manager.allow("0xtoken" as Address);

    const rawKey = (await signer.getAddress()).toLowerCase();
    const stored = await store.get(rawKey);
    expect(stored).toBeNull();
  });

  it("loads credentials from store on new instance", async () => {
    await manager.allow("0xtoken" as Address);

    // Simulate page reload: session signatures are lost
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 7,
    });
    await manager2.allow("0xtoken" as Address);

    // Keypair should NOT be regenerated — only re-signed
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    // signTypedData called twice: once for original create, once for re-sign on new instance
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("loads credentials stored without signature field (new format)", async () => {
    // Create credentials to get valid encrypted data
    await manager.allow("0xtoken" as Address);

    // Read stored data and strip the signature field (simulate new format)
    const stored = await store.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    delete parsed.signature;
    await store.set(storeKey, parsed);

    // Simulate page reload: session signatures are lost
    // New manager instance should re-sign and return valid credentials
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 1,
    });
    const creds2 = await manager2.allow("0xtoken" as Address);

    // Should have re-signed (1 original + 1 re-sign)
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(creds2.privateKey).toBe("0xpriv456");
    expect(creds2.signature).toBe("0xsig789");
  });

  it("invalidates expired credentials", async () => {
    // First call creates credentials — which get stored under the hashed key
    await manager.allow("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();

    // Tamper the stored data to simulate expiration
    const stored = await store.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await store.set(storeKey, parsed);

    // New manager (no cache) reads expired data from store → re-generates
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 7,
    });
    const creds = await manager2.allow("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
    expect(creds.publicKey).toBe("0xpub123");
  });

  it("clears credentials", async () => {
    await manager.allow("0xtoken" as Address);
    await manager.clear();

    const stored = await store.get(storeKey);
    expect(stored).toBeNull();
  });

  it("throws SigningRejected when user rejects signature (rejected)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User rejected the request"));

    await expect(manager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );
  });

  it("throws SigningRejected when user denies signature (denied)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User denied transaction"));

    await expect(manager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );
  });

  it("throws SigningFailed for other signing errors", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("network timeout"));

    await expect(manager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );
  });

  it("throws SigningFailed for non-Error exceptions", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue("unexpected");

    const err = await manager.allow("0xtoken" as Address).catch((e) => e);
    expect(err).toBeInstanceOf(ZamaError);
    expect(err.code).toBe(ZamaErrorCode.SigningFailed);
    expect(err.cause).toBeUndefined();
  });

  it("regenerates when stored JSON is corrupted", async () => {
    // Write garbage to the store
    await store.set(storeKey, "not-valid-json{{{{");

    const creds = await manager.allow("0xtoken" as Address);

    // Should regenerate fresh credentials
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");

    // Corrupted data should have been cleaned up
    const stored = await store.get(storeKey);
    expect(stored).not.toBe("not-valid-json{{{{");
  });

  it("continues when storage removeItem fails during cleanup", async () => {
    // Write corrupted data to trigger the catch path
    await store.set(storeKey, "corrupted");

    // Make removeItem throw to test best-effort cleanup
    const originalRemoveItem = store.delete.bind(store);
    store.delete = vi.fn().mockImplementation((key: string) => {
      if (key === storeKey) throw new Error("storage unavailable");
      return originalRemoveItem(key);
    });

    // Should still regenerate and return valid credentials
    const creds = await manager.allow("0xtoken" as Address);
    expect(creds.publicKey).toBe("0xpub123");
    expect(store.delete).toHaveBeenCalledWith(storeKey);
  });

  it("invalidates credentials at exact expiration boundary", async () => {
    await manager.allow("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();

    // Set startTimestamp to exactly durationDays ago (expired at boundary)
    const stored = await store.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 1 * 86400; // exactly 1 day ago
    await store.set(storeKey, parsed);

    // New manager should see expired credentials (nowSeconds >= expiresAt)
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 1,
    });
    await manager2.allow("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
  });

  describe("isExpired", () => {
    it("returns false when no credentials are stored", async () => {
      expect(await manager.isExpired()).toBe(false);
    });

    it("returns false when credentials are valid", async () => {
      await manager.allow("0xtoken" as Address);
      expect(await manager.isExpired()).toBe(false);
    });

    it("returns true when credentials are expired", async () => {
      await manager.allow("0xtoken" as Address);

      // Tamper stored data to simulate expiration
      const stored = await store.get(storeKey);
      const parsed = { ...(stored as Record<string, unknown>) };
      parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
      await store.set(storeKey, parsed);

      const manager2 = new CredentialsManager({
        relayer: sdk as unknown as RelayerSDK,
        signer,
        storage: store,
        sessionStorage: new MemoryStorage(),
        durationDays: 1,
      });
      expect(await manager2.isExpired()).toBe(true);
    });

    it("returns true when credentials don't cover the requested contract", async () => {
      await manager.allow("0xtoken" as Address);

      const manager2 = new CredentialsManager({
        relayer: sdk as unknown as RelayerSDK,
        signer,
        storage: store,
        sessionStorage: new MemoryStorage(),
        durationDays: 1,
      });
      expect(await manager2.isExpired("0xother" as Address)).toBe(true);
    });

    it("returns false when stored data is corrupted", async () => {
      await store.set(storeKey, "corrupted-json{{{");
      expect(await manager.isExpired()).toBe(false);
    });

    it("works without session signature (checks timestamp only)", async () => {
      await manager.allow("0xtoken" as Address);
      await manager.revoke();

      // Should still report not expired without needing the signature
      expect(await manager.isExpired()).toBe(false);
    });
  });

  it("clear() also clears the session signature", async () => {
    await manager.allow("0xtoken" as Address);
    expect(await manager.isAllowed()).toBe(true);

    await manager.clear();
    expect(await manager.isAllowed()).toBe(false);

    // Storage should also be empty
    const stored = await store.get(storeKey);
    expect(stored).toBeNull();
  });
});

describe("session allow/revoke", () => {
  let sdk: RelayerSDK;
  let signer: ReturnType<typeof createMockSigner>;
  let store: MemoryStorage;
  let manager: CredentialsManager;

  beforeEach(async () => {
    sdk = createMockRelayer({
      generateKeypair: vi.fn().mockResolvedValue({
        publicKey: "0xpub123",
        privateKey: "0xpriv456",
      }),
    });
    signer = createMockSigner("0xuser" as Address, {
      signTypedData: vi.fn().mockResolvedValue("0xsig789"),
    });
    store = new MemoryStorage();
    manager = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 1,
    });
  });

  it("revoke() clears session signature, next get() re-signs", async () => {
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    await manager.revoke();

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("isAllowed() returns true after allow(), false after revoke()", async () => {
    expect(await manager.isAllowed()).toBe(false);

    await manager.allow("0xtoken" as Address);
    expect(await manager.isAllowed()).toBe(true);

    await manager.revoke();
    expect(await manager.isAllowed()).toBe(false);
  });

  it("allow() pre-caches session signature without needing stored credentials", async () => {
    await manager.allow("0xtoken" as Address);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await manager.isAllowed()).toBe(true);

    // Subsequent get() should not re-sign
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("revoke() emits CredentialsRevoked event", async () => {
    const events: string[] = [];
    const manager2 = new CredentialsManager({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      sessionStorage: new MemoryStorage(),
      durationDays: 1,
      onEvent: (e) => events.push(e.type),
    });

    await manager2.allow("0xtoken" as Address);
    await manager2.revoke();

    expect(events).toContain(ZamaSDKEvents.CredentialsRevoked);
  });
});

describe("CredentialExpiredError", () => {
  it("has the correct error code", () => {
    const error = new CredentialExpiredError("credentials expired");
    expect(error.code).toBe(ZamaErrorCode.CredentialExpired);
    expect(error.name).toBe("CredentialExpiredError");
    expect(error).toBeInstanceOf(ZamaError);
  });
});
