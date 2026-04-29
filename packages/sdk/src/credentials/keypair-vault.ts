import { getAddress, type Address } from "viem";
import type { GenericStorage } from "../types";
import { KeypairTTLSchema, StoredKeypairSchema } from "./schemas";
import type { KeypairGenerator, StoredKeypair } from "./types";
import { keypairStorageKey } from "./storage-keys";

interface KeypairVaultConfig {
  generator: KeypairGenerator;
  storage: GenericStorage;
  /** Keypair lifetime in seconds. */
  ttl: number;
}

/**
 * Identity-scoped, chain-independent vault for ML-KEM keypairs.
 *
 * One keypair per signer address; the keypair survives chain switches and
 * permit revocations. Storage entries are keyed only by the signer address.
 */
export class KeypairVault {
  readonly #generator: KeypairGenerator;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #pending = new Map<string, Promise<StoredKeypair>>();

  constructor(config: KeypairVaultConfig) {
    this.#generator = config.generator;
    this.#storage = config.storage;
    this.#ttl = KeypairTTLSchema.parse(config.ttl);
  }

  /** @internal */
  static async storageKey(signerAddress: Address): Promise<string> {
    return keypairStorageKey(signerAddress);
  }

  /**
   * Read the stored keypair for the given signer address.
   *
   * @returns The keypair, or `null` if absent or expired.
   */
  async get(signerAddress: Address): Promise<StoredKeypair | null> {
    const key = await KeypairVault.storageKey(signerAddress);
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return null;
    }
    const parsed = StoredKeypairSchema.safeParse(raw);
    if (!parsed.success) {
      // Treat invalid shape as corruption — drop the entry so a fresh one can be generated.
      await safeDelete(this.#storage, key);
      return null;
    }
    const stored = parsed.data;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds >= stored.createdAt + stored.durationSeconds) {
      await safeDelete(this.#storage, key);
      return null;
    }
    return stored;
  }

  /** Returns `true` if a valid, non-expired keypair exists for the given address. */
  async has(signerAddress: Address): Promise<boolean> {
    return (await this.get(signerAddress)) !== null;
  }

  /**
   * Return the cached keypair, generating and persisting a fresh one if absent or expired.
   *
   * @remarks Deduplicates concurrent calls — simultaneous requests share one generation promise.
   */
  async getOrCreate(signerAddress: Address): Promise<StoredKeypair> {
    const checksummed = getAddress(signerAddress);
    const existing = this.#pending.get(checksummed);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const cached = await this.get(checksummed);
      if (cached !== null) {
        return cached;
      }
      const fresh = await this.#generator.generateKeypair();
      const stored: StoredKeypair = {
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        createdAt: Math.floor(Date.now() / 1000),
        durationSeconds: this.#ttl,
      };
      const key = await KeypairVault.storageKey(checksummed);
      try {
        await this.#storage.set(key, stored);
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] Failed to persist keypair:", error);
      }
      return stored;
    })().finally(() => {
      this.#pending.delete(checksummed);
    });

    this.#pending.set(checksummed, promise);
    return promise;
  }

  /** Delete the stored keypair for the given address. */
  async clear(signerAddress: Address): Promise<void> {
    const key = await KeypairVault.storageKey(signerAddress);
    await safeDelete(this.#storage, key);
  }
}

async function safeDelete(storage: GenericStorage, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn("[zama-sdk] Failed to delete keypair entry:", error);
  }
}
