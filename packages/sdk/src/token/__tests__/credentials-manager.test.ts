import { describe, it, expect, vi } from "../../test-fixtures";
import { CredentialsManager } from "../credentials-manager";
import { ZamaError, ZamaErrorCode } from "../token.types";
import { KeypairExpiredError } from "../errors";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { GenericSigner } from "../token.types";
import { ZamaSDKEvents } from "../../events";

/** Compute the truncated SHA-256 store key used by CredentialManager. */
async function computeStoreKey(address: string, chainId: number = 31337): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

/** Override fixture mock return values to match test expectations. */
function setupMocks(relayer: RelayerSDK, signer: GenericSigner) {
  vi.mocked(relayer.generateKeypair).mockResolvedValue({
    publicKey: "0xpub123",
    privateKey: "0xpriv456",
  });
  vi.mocked(signer.signTypedData).mockResolvedValue("0xsig789");
}

describe("CredentialsManager", () => {
  it("generates new credentials on first call", async ({ relayer, signer, credentialManager }) => {
    setupMocks(relayer, signer);

    const creds = await credentialManager.allow("0xtoken" as Address);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");
    expect(creds.privateKey).toBe("0xpriv456");
    expect(creds.signature).toBe("0xsig789");
  });

  it("returns cached credentials on second call with same contracts", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow("0xtoken" as Address);
    await credentialManager.allow("0xtoken" as Address);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  it("re-signs when new contract not in signed list", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow("0xtoken1" as Address);
    await credentialManager.allow("0xtoken1" as Address, "0xtoken2" as Address);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("persists credentials to store with hashed key", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    await credentialManager.allow("0xtoken" as Address);

    const stored = await storage.get(storeKey);
    expect(stored).not.toBeNull();
    const parsed = stored as Record<string, unknown>;
    expect(parsed.publicKey).toBe("0xpub123");
    // Signature should NOT be persisted (session-scoped only)
    expect(parsed.signature).toBeUndefined();
  });

  it("does not store the full address as key", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow("0xtoken" as Address);

    const rawKey = (await signer.getAddress()).toLowerCase();
    const stored = await storage.get(rawKey);
    expect(stored).toBeNull();
  });

  it("loads credentials from store on new instance", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });

    await manager.allow("0xtoken" as Address);

    // Simulate page reload: session signatures are lost
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 604800,
    });
    await manager2.allow("0xtoken" as Address);

    // Keypair should NOT be regenerated — only re-signed
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // signTypedData called twice: once for original create, once for re-sign on new instance
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("loads credentials stored without signature field (new format)", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    const storeKey = await computeStoreKey(await signer.getAddress());

    // Create credentials to get valid encrypted data
    await manager.allow("0xtoken" as Address);

    // Read stored data and strip the signature field (simulate new format)
    const stored = await storage.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    delete parsed.signature;
    await storage.set(storeKey, parsed);

    // Simulate page reload: session signatures are lost
    // New manager instance should re-sign and return valid credentials
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    const creds2 = await manager2.allow("0xtoken" as Address);

    // Should have re-signed (1 original + 1 re-sign)
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(creds2.privateKey).toBe("0xpriv456");
    expect(creds2.signature).toBe("0xsig789");
  });

  it("invalidates expired credentials", async ({ relayer, signer, storage, createMockStorage }) => {
    setupMocks(relayer, signer);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    const storeKey = await computeStoreKey(await signer.getAddress());

    // First call creates credentials — which get stored under the hashed key
    await manager.allow("0xtoken" as Address);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();

    // Tamper the stored data to simulate expiration
    const stored = await storage.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await storage.set(storeKey, parsed);

    // New manager (no cache) reads expired data from store → re-generates
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 604800,
    });
    const creds = await manager2.allow("0xtoken" as Address);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
    expect(creds.publicKey).toBe("0xpub123");
  });

  it("clears credentials", async ({ relayer, signer, storage, credentialManager }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    await credentialManager.allow("0xtoken" as Address);
    await credentialManager.clear();

    const stored = await storage.get(storeKey);
    expect(stored).toBeNull();
  });

  it("throws SigningRejected when user rejects signature (rejected)", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User rejected the request"));

    await expect(credentialManager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await credentialManager.allow("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningRejected when user denies signature (denied)", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User denied transaction"));

    await expect(credentialManager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await credentialManager.allow("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningFailed for other signing errors", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("network timeout"));

    await expect(credentialManager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await credentialManager.allow("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningFailed for non-Error exceptions", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    vi.mocked(signer.signTypedData).mockRejectedValue("unexpected");

    await expect(credentialManager.allow("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await credentialManager.allow("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
      expect((e as ZamaError).cause).toBeUndefined();
    }
  });

  it("regenerates when stored JSON is corrupted", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    // Write garbage to the store
    await storage.set(storeKey, "not-valid-json{{{{");

    const creds = await credentialManager.allow("0xtoken" as Address);

    // Should regenerate fresh credentials
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");

    // Corrupted data should have been cleaned up
    const stored = await storage.get(storeKey);
    expect(stored).not.toBe("not-valid-json{{{{");
  });

  it("continues when storage removeItem fails during cleanup", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    // Write corrupted data to trigger the catch path
    await storage.set(storeKey, "corrupted");

    // Make removeItem throw to test best-effort cleanup
    const originalRemoveItem = storage.delete.bind(storage);
    storage.delete = vi.fn().mockImplementation((key: string) => {
      if (key === storeKey) throw new Error("storage unavailable");
      return originalRemoveItem(key);
    });

    // Should still regenerate and return valid credentials
    const creds = await credentialManager.allow("0xtoken" as Address);
    expect(creds.publicKey).toBe("0xpub123");
    expect(storage.delete).toHaveBeenCalledWith(storeKey);
  });

  it("invalidates credentials at exact expiration boundary", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    const storeKey = await computeStoreKey(await signer.getAddress());

    await manager.allow("0xtoken" as Address);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();

    // Set startTimestamp to exactly keypairTTL ago (expired at boundary)
    const stored = await storage.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 1 * 86400; // exactly 1 day ago
    await storage.set(storeKey, parsed);

    // New manager should see expired credentials (nowSeconds >= expiresAt)
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    await manager2.allow("0xtoken" as Address);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  });

  describe("isExpired", () => {
    it("returns false when no credentials are stored", async ({
      relayer,
      signer,
      credentialManager,
    }) => {
      setupMocks(relayer, signer);
      expect(await credentialManager.isExpired()).toBe(false);
    });

    it("returns false when credentials are valid", async ({
      relayer,
      signer,
      credentialManager,
    }) => {
      setupMocks(relayer, signer);
      await credentialManager.allow("0xtoken" as Address);
      expect(await credentialManager.isExpired()).toBe(false);
    });

    it("returns true when credentials are expired", async ({
      relayer,
      signer,
      storage,
      createMockStorage,
    }) => {
      setupMocks(relayer, signer);
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage: createMockStorage(),
        keypairTTL: 86400,
      });
      const storeKey = await computeStoreKey(await signer.getAddress());

      await manager.allow("0xtoken" as Address);

      // Tamper stored data to simulate expiration
      const stored = await storage.get(storeKey);
      const parsed = { ...(stored as Record<string, unknown>) };
      parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
      await storage.set(storeKey, parsed);

      const manager2 = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage: createMockStorage(),
        keypairTTL: 86400,
      });
      expect(await manager2.isExpired()).toBe(true);
    });

    it("returns true when credentials don't cover the requested contract", async ({
      relayer,
      signer,
      storage,
      createMockStorage,
    }) => {
      setupMocks(relayer, signer);
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage: createMockStorage(),
        keypairTTL: 86400,
      });

      await manager.allow("0xtoken" as Address);

      const manager2 = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage: createMockStorage(),
        keypairTTL: 86400,
      });
      expect(await manager2.isExpired("0xother" as Address)).toBe(true);
    });

    it("returns false when stored data is corrupted", async ({
      relayer,
      signer,
      storage,
      credentialManager,
    }) => {
      setupMocks(relayer, signer);
      const storeKey = await computeStoreKey(await signer.getAddress());
      await storage.set(storeKey, "corrupted-json{{{");
      expect(await credentialManager.isExpired()).toBe(false);
    });

    it("works without session signature (checks timestamp only)", async ({
      relayer,
      signer,
      credentialManager,
    }) => {
      setupMocks(relayer, signer);
      await credentialManager.allow("0xtoken" as Address);
      await credentialManager.revoke();

      // Should still report not expired without needing the signature
      expect(await credentialManager.isExpired()).toBe(false);
    });
  });

  it("clear() also clears the session signature", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    await credentialManager.allow("0xtoken" as Address);
    expect(await credentialManager.isAllowed()).toBe(true);

    await credentialManager.clear();
    expect(await credentialManager.isAllowed()).toBe(false);

    // Storage should also be empty
    const stored = await storage.get(storeKey);
    expect(stored).toBeNull();
  });
});

describe("session allow/revoke", () => {
  it("revoke() clears session signature, next get() re-signs", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    await credentialManager.revoke();

    await credentialManager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("isAllowed() returns true after allow(), false after revoke()", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    expect(await credentialManager.isAllowed()).toBe(false);

    await credentialManager.allow("0xtoken" as Address);
    expect(await credentialManager.isAllowed()).toBe(true);

    await credentialManager.revoke();
    expect(await credentialManager.isAllowed()).toBe(false);
  });

  it("allow() pre-caches session signature without needing stored credentials", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow("0xtoken" as Address);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialManager.isAllowed()).toBe(true);

    // Subsequent get() should not re-sign
    await credentialManager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("revoke() emits CredentialsRevoked event", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);
    const events: string[] = [];
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      onEvent: (e) => events.push(e.type),
    });

    await manager2.allow("0xtoken" as Address);
    await manager2.revoke();

    expect(events).toContain(ZamaSDKEvents.CredentialsRevoked);
  });
});

describe("KeypairExpiredError", () => {
  it("has the correct error code", () => {
    const error = new KeypairExpiredError("credentials expired");
    expect(error.code).toBe(ZamaErrorCode.KeypairExpired);
    expect(error.name).toBe("KeypairExpiredError");
    expect(error).toBeInstanceOf(ZamaError);
  });
});
