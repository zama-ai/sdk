import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialsManager } from "../credential-manager";
import { MemoryStorage } from "../memory-storage";
import type { GenericSigner } from "../token.types";
import { ZamaError, ZamaErrorCode } from "../token.types";
import { CredentialExpiredError } from "../errors";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";

function createMockSdk() {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub123",
      privateKey: "0xpriv456",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub123",
        contractAddresses: ["0xtoken"],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
  } as unknown as RelayerSDK;
}

function createMockSigner(address: Address = "0xuser" as Address): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig789"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

/** Compute the truncated SHA-256 store key used by CredentialManager. */
async function computeStoreKey(address: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address.toLowerCase()),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

describe("CredentialsManager", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let store: MemoryStorage;
  let manager: CredentialsManager;
  let storeKey: string;

  beforeEach(async () => {
    sdk = createMockSdk();
    signer = createMockSigner();
    store = new MemoryStorage();
    manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
    });
    storeKey = await computeStoreKey(await signer.getAddress());
  });

  it("generates new credentials on first call", async () => {
    const creds = await manager.get("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    expect(sdk.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");
    expect(creds.privateKey).toBe("0xpriv456");
    expect(creds.signature).toBe("0xsig789");
  });

  it("returns cached credentials on second call with same contracts", async () => {
    await manager.get("0xtoken" as Address);
    await manager.get("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("re-signs when new contract not in signed list", async () => {
    await manager.get("0xtoken1" as Address);
    await manager.getAll(["0xtoken1" as Address, "0xtoken2" as Address]);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("persists credentials to store with hashed key", async () => {
    await manager.get("0xtoken" as Address);

    const stored = await store.getItem(storeKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.publicKey).toBe("0xpub123");
    // Signature should NOT be persisted (session-scoped only)
    expect(parsed.signature).toBeUndefined();
  });

  it("does not store the full address as key", async () => {
    await manager.get("0xtoken" as Address);

    const rawKey = (await signer.getAddress()).toLowerCase();
    const stored = await store.getItem(rawKey);
    expect(stored).toBeNull();
  });

  it("loads credentials from store on new instance", async () => {
    await manager.get("0xtoken" as Address);

    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 7,
    });
    await manager2.get("0xtoken" as Address);

    // Keypair should NOT be regenerated — only re-signed
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    // signTypedData called twice: once for original create, once for re-sign on new instance
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("loads credentials stored without signature field (new format)", async () => {
    // Create credentials to get valid encrypted data
    await manager.get("0xtoken" as Address);

    // Read stored data and strip the signature field (simulate new format)
    const stored = await store.getItem(storeKey);
    const parsed = JSON.parse(stored!);
    delete parsed.signature;
    await store.setItem(storeKey, JSON.stringify(parsed));

    // New manager instance should re-sign and return valid credentials
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
    });
    const creds2 = await manager2.get("0xtoken" as Address);

    // Should have re-signed (1 original + 1 re-sign)
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(creds2.privateKey).toBe("0xpriv456");
    expect(creds2.signature).toBe("0xsig789");
  });

  it("invalidates expired credentials", async () => {
    // First call creates credentials — which get stored under the hashed key
    await manager.get("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();

    // Tamper the stored data to simulate expiration
    const stored = await store.getItem(storeKey);
    const parsed = JSON.parse(stored!);
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await store.setItem(storeKey, JSON.stringify(parsed));

    // New manager (no cache) reads expired data from store → re-generates
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 7,
    });
    const creds = await manager2.get("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
    expect(creds.publicKey).toBe("0xpub123");
  });

  it("clears credentials", async () => {
    await manager.get("0xtoken" as Address);
    await manager.clear();

    const stored = await store.getItem(storeKey);
    expect(stored).toBeNull();
  });

  it("throws SigningRejected when user rejects signature (rejected)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User rejected the request"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningRejected when user denies signature (denied)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User denied transaction"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningRejected,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningFailed for other signing errors", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("network timeout"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
    }
  });

  it("throws SigningFailed for non-Error exceptions", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue("unexpected");

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: ZamaErrorCode.SigningFailed,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(ZamaError);
      expect((e as ZamaError).cause).toBeUndefined();
    }
  });

  it("regenerates when stored JSON is corrupted", async () => {
    // Write garbage to the store
    await store.setItem(storeKey, "not-valid-json{{{{");

    const creds = await manager.get("0xtoken" as Address);

    // Should regenerate fresh credentials
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
    expect(creds.publicKey).toBe("0xpub123");

    // Corrupted data should have been cleaned up
    const stored = await store.getItem(storeKey);
    expect(stored).not.toBe("not-valid-json{{{{");
  });

  it("continues when storage removeItem fails during cleanup", async () => {
    // Write corrupted data to trigger the catch path
    await store.setItem(storeKey, "corrupted");

    // Make removeItem throw to test best-effort cleanup
    const originalRemoveItem = store.removeItem.bind(store);
    store.removeItem = vi.fn().mockImplementation((key: string) => {
      if (key === storeKey) throw new Error("storage unavailable");
      return originalRemoveItem(key);
    });

    // Should still regenerate and return valid credentials
    const creds = await manager.get("0xtoken" as Address);
    expect(creds.publicKey).toBe("0xpub123");
    expect(store.removeItem).toHaveBeenCalledWith(storeKey);
  });

  it("invalidates credentials at exact expiration boundary", async () => {
    await manager.get("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();

    // Set startTimestamp to exactly durationDays ago (expired at boundary)
    const stored = await store.getItem(storeKey);
    const parsed = JSON.parse(stored!);
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 1 * 86400; // exactly 1 day ago
    await store.setItem(storeKey, JSON.stringify(parsed));

    // New manager should see expired credentials (nowSeconds >= expiresAt)
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
    });
    await manager2.get("0xtoken" as Address);

    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);
  });

  describe("isExpired", () => {
    it("returns false when no credentials are stored", async () => {
      expect(await manager.isExpired()).toBe(false);
    });

    it("returns false when credentials are valid", async () => {
      await manager.get("0xtoken" as Address);
      expect(await manager.isExpired()).toBe(false);
    });

    it("returns true when credentials are expired", async () => {
      await manager.get("0xtoken" as Address);

      // Tamper stored data to simulate expiration
      const stored = await store.getItem(storeKey);
      const parsed = JSON.parse(stored!);
      parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
      await store.setItem(storeKey, JSON.stringify(parsed));

      const manager2 = new CredentialsManager({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: store,
        durationDays: 1,
      });
      expect(await manager2.isExpired()).toBe(true);
    });

    it("returns true when credentials don't cover the requested contract", async () => {
      await manager.get("0xtoken" as Address);

      const manager2 = new CredentialsManager({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: store,
        durationDays: 1,
      });
      expect(await manager2.isExpired("0xother" as Address)).toBe(true);
    });

    it("returns false when stored data is corrupted", async () => {
      await store.setItem(storeKey, "corrupted-json{{{");
      expect(await manager.isExpired()).toBe(false);
    });

    it("works without session signature (checks timestamp only)", async () => {
      await manager.get("0xtoken" as Address);
      manager.lock();

      // Should still report not expired without needing the signature
      expect(await manager.isExpired()).toBe(false);
    });
  });

  it("clear() also clears the session signature", async () => {
    await manager.get("0xtoken" as Address);
    expect(await manager.isUnlocked()).toBe(true);

    await manager.clear();
    expect(await manager.isUnlocked()).toBe(false);

    // Storage should also be empty
    const stored = await store.getItem(storeKey);
    expect(stored).toBeNull();
  });
});

describe("session lock/unlock", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let store: MemoryStorage;
  let manager: CredentialsManager;

  beforeEach(async () => {
    sdk = createMockSdk();
    signer = createMockSigner();
    store = new MemoryStorage();
    manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
    });
  });

  it("lock() clears session signature, next get() re-signs", async () => {
    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);

    manager.lock();

    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("isUnlocked() returns true after get(), false after lock()", async () => {
    expect(await manager.isUnlocked()).toBe(false);

    await manager.get("0xtoken" as Address);
    expect(await manager.isUnlocked()).toBe(true);

    manager.lock();
    expect(await manager.isUnlocked()).toBe(false);
  });

  it("unlock() pre-caches session signature without needing stored credentials", async () => {
    await manager.unlock(["0xtoken" as Address]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await manager.isUnlocked()).toBe(true);

    // Subsequent get() should not re-sign
    await manager.get("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("lock() emits CredentialsLocked event", async () => {
    const events: string[] = [];
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
      onEvent: (e) => events.push(e.type),
    });

    await manager2.get("0xtoken" as Address);
    manager2.lock();

    expect(events).toContain("credentials:locked");
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
