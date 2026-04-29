import { describe, expect, it, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import type { Address } from "viem";
import { KeypairVault } from "../keypair-vault";
import type { KeypairGenerator } from "../types";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const OTHER = "0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C" as Address;
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;

function createGenerator(): KeypairGenerator {
  return {
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }),
  };
}

describe("KeypairVault", () => {
  it("getOrCreate returns a fresh keypair on first call", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    const keypair = await vault.getOrCreate(USER);
    expect(keypair.publicKey).toBe(PUBLIC_KEY);
    expect(keypair.privateKey).toBe(PRIVATE_KEY);
    expect(generator.generateKeypair).toHaveBeenCalledOnce();
  });

  it("getOrCreate returns the same keypair on second call within TTL", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    const a = await vault.getOrCreate(USER);
    const b = await vault.getOrCreate(USER);
    expect(b).toEqual(a);
    expect(generator.generateKeypair).toHaveBeenCalledOnce();
  });

  it("dedupes concurrent getOrCreate calls", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    await Promise.all([vault.getOrCreate(USER), vault.getOrCreate(USER), vault.getOrCreate(USER)]);
    expect(generator.generateKeypair).toHaveBeenCalledOnce();
  });

  it("different addresses produce distinct entries", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    await vault.getOrCreate(USER);
    await vault.getOrCreate(OTHER);
    expect(generator.generateKeypair).toHaveBeenCalledTimes(2);
  });

  it("has() returns false when no keypair exists", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    expect(await vault.has(USER)).toBe(false);
  });

  it("has() returns true after getOrCreate", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    await vault.getOrCreate(USER);
    expect(await vault.has(USER)).toBe(true);
  });

  it("clear() removes the entry", async () => {
    const generator = createGenerator();
    const vault = new KeypairVault({ generator, storage: new MemoryStorage(), ttl: 86400 });
    await vault.getOrCreate(USER);
    await vault.clear(USER);
    expect(await vault.has(USER)).toBe(false);
  });

  it("drops malformed stored keypairs", async () => {
    const generator = createGenerator();
    const storage = new MemoryStorage();
    const vault = new KeypairVault({ generator, storage, ttl: 86400 });
    const key = await KeypairVault.storageKey(USER);
    await storage.set(key, {
      publicKey: "0xnot-hex",
      privateKey: PRIVATE_KEY,
      createdAt: Math.floor(Date.now() / 1000),
      durationSeconds: 86400,
    });

    expect(await vault.get(USER)).toBeNull();
    expect(await storage.get(key)).toBeNull();
  });

  it("deletes expired keypairs", async () => {
    const generator = createGenerator();
    const storage = new MemoryStorage();
    const vault = new KeypairVault({ generator, storage, ttl: 86400 });
    const key = await KeypairVault.storageKey(USER);
    await storage.set(key, {
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      createdAt: Math.floor(Date.now() / 1000) - 86401,
      durationSeconds: 86400,
    });

    expect(await vault.get(USER)).toBeNull();
    expect(await storage.get(key)).toBeNull();
  });

  it("storage key is chain-independent", async () => {
    const keyA = await KeypairVault.storageKey(USER);
    const keyB = await KeypairVault.storageKey(USER);
    expect(keyA).toBe(keyB);
    expect(keyA.startsWith("keypair:")).toBe(true);
  });
});
