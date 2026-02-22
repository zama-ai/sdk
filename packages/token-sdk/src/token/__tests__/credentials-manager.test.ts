import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialsManager } from "../credential-manager";
import { MemoryStorage } from "../memory-storage";
import type { ConfidentialSigner } from "../token.types";
import { TokenError, TokenErrorCode } from "../token.types";
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

function createMockSigner(address: Address = "0xuser" as Address): ConfidentialSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig789"),
    writeContract: vi.fn(),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
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
  return hex.slice(0, 16);
}

describe("CredentialsManager", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: ConfidentialSigner;
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

    const stored = store.getItem(storeKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.publicKey).toBe("0xpub123");
  });

  it("does not store the full address as key", async () => {
    await manager.get("0xtoken" as Address);

    const rawKey = (await signer.getAddress()).toLowerCase();
    const stored = store.getItem(rawKey);
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

    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("invalidates expired credentials", async () => {
    // First call creates credentials — which get stored under the hashed key
    await manager.get("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();

    // Tamper the stored data to simulate expiration
    const stored = store.getItem(storeKey);
    const parsed = JSON.parse(stored!);
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    store.setItem(storeKey, JSON.stringify(parsed));

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

    const stored = store.getItem(storeKey);
    expect(stored).toBeNull();
  });

  it("throws SigningRejected when user rejects signature (rejected)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User rejected the request"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: TokenErrorCode.SigningRejected,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
    }
  });

  it("throws SigningRejected when user denies signature (denied)", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("User denied transaction"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: TokenErrorCode.SigningRejected,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
    }
  });

  it("throws SigningFailed for other signing errors", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue(new Error("network timeout"));

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: TokenErrorCode.SigningFailed,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
    }
  });

  it("throws SigningFailed for non-Error exceptions", async () => {
    vi.mocked(signer.signTypedData).mockRejectedValue("unexpected");

    await expect(manager.get("0xtoken" as Address)).rejects.toThrow(
      expect.objectContaining({
        code: TokenErrorCode.SigningFailed,
      }),
    );

    try {
      await manager.get("0xtoken" as Address);
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
      expect((e as TokenError).cause).toBeUndefined();
    }
  });
});
