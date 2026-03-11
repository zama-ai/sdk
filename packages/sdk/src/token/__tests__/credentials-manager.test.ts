import { describe, it, expect, vi } from "../../test-fixtures";
import { CredentialsManager } from "../credentials-manager";
import { ZamaError, ZamaErrorCode } from "../errors";
import { KeypairExpiredError } from "../errors";

import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { GenericSigner } from "../token.types";
import { ZamaSDKEvents } from "../../events";
import type { Address } from "viem";

const TOKEN_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const TOKEN_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

/** Compute the truncated SHA-256 store key used by CredentialManager. */
async function computeStoreKey(address: Address, chainId: number = 31337): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address}:${chainId}`),
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

    const creds = await credentialManager.allow(TOKEN_A);

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

    await credentialManager.allow(TOKEN_A);
    await credentialManager.allow(TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  it("re-signs when new contract not in signed list but reuses keypair", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);
    const creds = await credentialManager.allow(TOKEN_A, TOKEN_B);

    // Keypair is reused — only one generation
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // Re-signed with the extended address set
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    // Merged contract addresses include both tokens (checksummed by getAddress)
    const normalized = creds.contractAddresses.map((a: string) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
  }, 30000);

  it("persists credentials to store with hashed key", async ({
    relayer,
    signer,
    storage,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    await credentialManager.allow(TOKEN_A);

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

    await credentialManager.allow(TOKEN_A);

    const rawKey = await signer.getAddress();
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

    await manager.allow(TOKEN_A);

    // Simulate page reload: session signatures are lost
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 604800,
    });
    await manager2.allow(TOKEN_A);

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
    await manager.allow(TOKEN_A);

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
    const creds2 = await manager2.allow(TOKEN_A);

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
    await manager.allow(TOKEN_A);
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
    const creds = await manager2.allow(TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
    expect(creds.publicKey).toBe("0xpub123");
  }, 30000);

  it("clears credentials", async ({ relayer, signer, storage, credentialManager }) => {
    setupMocks(relayer, signer);
    const storeKey = await computeStoreKey(await signer.getAddress());

    await credentialManager.allow(TOKEN_A);
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

    await expect(credentialManager.allow(TOKEN_A)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await credentialManager.allow(TOKEN_A);
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

    await expect(credentialManager.allow(TOKEN_A)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await credentialManager.allow(TOKEN_A);
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

    await expect(credentialManager.allow(TOKEN_A)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await credentialManager.allow(TOKEN_A);
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

    await expect(credentialManager.allow(TOKEN_A)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await credentialManager.allow(TOKEN_A);
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

    const creds = await credentialManager.allow(TOKEN_A);

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
    const creds = await credentialManager.allow(TOKEN_A);
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

    await manager.allow(TOKEN_A);
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
    await manager2.allow(TOKEN_A);

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
      await credentialManager.allow(TOKEN_A);
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

      await manager.allow(TOKEN_A);

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

      await manager.allow(TOKEN_A);

      const manager2 = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage: createMockStorage(),
        keypairTTL: 86400,
      });
      expect(await manager2.isExpired(TOKEN_B)).toBe(true);
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
      await credentialManager.allow(TOKEN_A);
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

    await credentialManager.allow(TOKEN_A);
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

    await credentialManager.allow(TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    await credentialManager.revoke();

    await credentialManager.allow(TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("isAllowed() returns true after allow(), false after revoke()", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    expect(await credentialManager.isAllowed()).toBe(false);

    await credentialManager.allow(TOKEN_A);
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

    await credentialManager.allow(TOKEN_A);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialManager.isAllowed()).toBe(true);

    // Subsequent get() should not re-sign
    await credentialManager.allow(TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  }, 30000);

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

    await manager2.allow(TOKEN_A);
    await manager2.revoke();

    expect(events).toContain(ZamaSDKEvents.CredentialsRevoked);
  });
});

describe("contract address extension", () => {
  const TOKEN_C = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

  it("extends contracts with active session, reusing keypair", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    const first = await credentialManager.allow(TOKEN_A);
    const extended = await credentialManager.allow(TOKEN_A, TOKEN_B);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    // Same keypair
    expect(extended.publicKey).toBe(first.publicKey);
    expect(extended.privateKey).toBe(first.privateKey);
    // Merged addresses
    const normalized = extended.contractAddresses.map((a) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
  });

  it("extends contracts after revoke (no session path)", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);
    await credentialManager.revoke();
    const extended = await credentialManager.allow(TOKEN_A, TOKEN_B);

    // Keypair reused — only one generation
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // Original sign + old-address sign for decrypt + merged-address sign for extend
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
    const normalized = extended.contractAddresses.map((a) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
  });

  it("extends contracts after page reload (new session storage, no session)", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);

    const manager1 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    await manager1.allow(TOKEN_A);

    // Simulate reload: new session storage, same persistent storage
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    const extended = await manager2.allow(TOKEN_A, TOKEN_B);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // Original sign + old-address sign for decrypt + merged-address sign for extend
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
    const normalized = extended.contractAddresses.map((a) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
  });

  it("caches extended credentials — third call with same set does not re-sign", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);
    await credentialManager.allow(TOKEN_A, TOKEN_B);
    await credentialManager.allow(TOKEN_A, TOKEN_B);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // Only 2 signatures: initial + extend. Third call is cached.
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("persists extended credentials across instances (simulated reload)", async ({
    relayer,
    signer,
    storage,
    createMockStorage,
  }) => {
    setupMocks(relayer, signer);

    const sharedSessionStorage = createMockStorage();
    const manager1 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: sharedSessionStorage,
      keypairTTL: 86400,
    });
    await manager1.allow(TOKEN_A);
    await manager1.allow(TOKEN_A, TOKEN_B);

    // Simulate page reload: fresh session storage, same persistent storage
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    await manager2.allow(TOKEN_A, TOKEN_B);

    // Keypair reused, but re-signed due to lost session
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });

  it("extends incrementally: A → A,B → A,B,C", async ({ relayer, signer, credentialManager }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);
    await credentialManager.allow(TOKEN_A, TOKEN_B);
    const final = await credentialManager.allow(TOKEN_A, TOKEN_B, TOKEN_C);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    // 3 signatures: initial + extend to B + extend to C
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
    const normalized = final.contractAddresses.map((a) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
    expect(normalized).toContain(TOKEN_C.toLowerCase());
  });

  it("subset of already-allowed contracts does not re-sign", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A, TOKEN_B);
    await credentialManager.allow(TOKEN_A); // subset

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("fully regenerates when credentials are time-expired even with missing contracts", async ({
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
    const storeKey = await CredentialsManager.computeStoreKey(
      await signer.getAddress(),
      await signer.getChainId(),
    );

    await manager.allow(TOKEN_A);

    // Tamper stored data to simulate time expiration
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
    await manager2.allow(TOKEN_A, TOKEN_B);

    // Time-expired → full regeneration, not extension
    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  }, 30000);

  it("EIP-712 is created with the merged contract set", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);
    await credentialManager.allow(TOKEN_A, TOKEN_B);

    // Second createEIP712 call should include both tokens
    const secondCall = vi.mocked(relayer.createEIP712).mock.calls[1]!;
    const contractAddresses = secondCall[1] as Address[];
    const normalized = contractAddresses.map((a) => a.toLowerCase());
    expect(normalized).toContain(TOKEN_A.toLowerCase());
    expect(normalized).toContain(TOKEN_B.toLowerCase());
  });
});

describe("storeKey caching", () => {
  it("caches the SHA-256 store key across multiple allow() calls", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);
    const digestSpy = vi.spyOn(crypto.subtle, "digest");

    await credentialManager.allow(TOKEN_A);
    const digestCallsAfterFirst = digestSpy.mock.calls.filter(
      ([algo]) => algo === "SHA-256",
    ).length;

    await credentialManager.allow(TOKEN_A);
    const digestCallsAfterSecond = digestSpy.mock.calls.filter(
      ([algo]) => algo === "SHA-256",
    ).length;

    // Second allow() should not trigger another SHA-256 digest for the store key
    expect(digestCallsAfterSecond).toBe(digestCallsAfterFirst);

    digestSpy.mockRestore();
  });

  it("reuses cached store key for isExpired() after allow()", async ({
    relayer,
    signer,
    credentialManager,
  }) => {
    setupMocks(relayer, signer);

    await credentialManager.allow(TOKEN_A);

    // Reset call counts to measure only isExpired() calls
    vi.mocked(signer.getAddress).mockClear();
    vi.mocked(signer.getChainId).mockClear();
    const digestSpy = vi.spyOn(crypto.subtle, "digest");

    await credentialManager.isExpired();

    // getAddress/getChainId are still called (to build identity string for comparison),
    // but SHA-256 digest should NOT be called again because the cache hits
    const sha256Calls = digestSpy.mock.calls.filter(([algo]) => algo === "SHA-256").length;
    expect(sha256Calls).toBe(0);

    digestSpy.mockRestore();
  });

  it("invalidates store key cache when signer address changes", async ({
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

    await manager.allow(TOKEN_A);

    // Change the signer address
    vi.mocked(signer.getAddress).mockResolvedValue(
      "0xdDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address,
    );

    const digestSpy = vi.spyOn(crypto.subtle, "digest");

    await manager.allow(TOKEN_A);

    // Should have recomputed the store key (new SHA-256 call)
    const sha256Calls = digestSpy.mock.calls.filter(([algo]) => algo === "SHA-256").length;
    expect(sha256Calls).toBeGreaterThanOrEqual(1);

    digestSpy.mockRestore();
  });

  it("invalidates store key cache when chain ID changes", async ({
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

    await manager.allow(TOKEN_A);

    // Change the chain ID
    vi.mocked(signer.getChainId).mockResolvedValue(1);

    const digestSpy = vi.spyOn(crypto.subtle, "digest");

    await manager.allow(TOKEN_A);

    const sha256Calls = digestSpy.mock.calls.filter(([algo]) => algo === "SHA-256").length;
    expect(sha256Calls).toBeGreaterThanOrEqual(1);

    digestSpy.mockRestore();
  });
});

describe("deriveKey caching", () => {
  it("caches the PBKDF2 derived key across decrypt and encrypt operations", async ({
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

    // First call creates and encrypts credentials (deriveKey called for encrypt)
    await manager.allow(TOKEN_A);

    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    // Simulate reload: new manager reads from storage and decrypts
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });
    await manager2.allow(TOKEN_A);

    const firstDeriveCalls = deriveKeySpy.mock.calls.length;

    // Extend to TOKEN_B — forces decrypt (to read existing) + encrypt (to persist extended).
    // Both #deriveKey calls use the same signature+address, so the cache should hit.
    await manager2.allow(TOKEN_A, TOKEN_B);

    const secondDeriveCalls = deriveKeySpy.mock.calls.length;

    // deriveKey should NOT have been called again because signature+address are the same
    expect(secondDeriveCalls).toBe(firstDeriveCalls);

    deriveKeySpy.mockRestore();
  });

  it("recomputes derived key when signature changes", async ({
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

    await manager.allow(TOKEN_A);

    const deriveKeySpy = vi.spyOn(crypto.subtle, "deriveKey");

    // Change signature for re-sign
    vi.mocked(signer.signTypedData).mockResolvedValue("0xnewsig999");

    // New manager forces re-sign with new signature
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });

    // This will fail to decrypt with the wrong signature, causing regeneration
    // which triggers a new deriveKey call for encryption
    await manager2.allow(TOKEN_A);

    expect(deriveKeySpy).toHaveBeenCalled();

    deriveKeySpy.mockRestore();
  });
});

describe("unified #isValid", () => {
  it("isExpired validates EncryptedCredentials from storage (without decryption)", async ({
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

    await manager.allow(TOKEN_A);

    // New manager without session — isExpired reads EncryptedCredentials directly
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
    });

    // Should report not expired (credentials are fresh)
    expect(await manager2.isExpired()).toBe(false);
    // Should report expired for uncovered contract
    expect(await manager2.isExpired(TOKEN_B)).toBe(true);
  });

  it("isExpired handles expired EncryptedCredentials without needing to decrypt", async ({
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

    await manager.allow(TOKEN_A);

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

    // No decrypt calls should be needed — #isValid works on EncryptedCredentials directly
    const decryptSpy = vi.spyOn(crypto.subtle, "decrypt");
    expect(await manager2.isExpired()).toBe(true);
    expect(decryptSpy).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
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
