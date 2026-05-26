import type { GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import { keypairStorageKey } from "./storage-keys";
import { StoredKeypairSchema } from "./schemas";
import type { Keypair, StoredKeypair } from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";
import { nowSeconds } from "./utils";

interface KeypairVaultConfig {
  /**
   * Produce a fresh keypair. The optional `chainId` lets the vault route
   * generation to a specific chain's relayer when warmup happens for a wallet
   * connected to a non-active chain — without mutating dispatcher state.
   */
  generator: (chainId?: number) => Promise<Keypair>;
  storage: GenericStorage;
  /** Keypair lifetime in seconds. Pre-validated by the caller. */
  ttl: number;
}

/**
 * Identity-scoped, chain-independent vault for ML-KEM keypairs.
 *
 * One keypair per signer address; the keypair survives chain switches and
 * permit revocations. Storage entries are keyed only by the signer address.
 */
export class KeypairVault {
  readonly #generator: (chainId?: number) => Promise<Keypair>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #pending = new Map<ChecksummedAddress, Promise<StoredKeypair>>();

  constructor(config: KeypairVaultConfig) {
    this.#generator = config.generator;
    this.#storage = config.storage;
    this.#ttl = config.ttl;
  }

  async readStored(signerAddress: ChecksummedAddress): Promise<StoredKeypair | null> {
    const key = keypairStorageKey(signerAddress);
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return null;
    }
    const parsed = StoredKeypairSchema.safeParse(raw);
    if (!parsed.success) {
      await swallow("delete keypair entry", () => this.#storage.delete(key));
      return null;
    }
    const stored = parsed.data;
    if (nowSeconds() >= stored.expiresAt) {
      await swallow("delete keypair entry", () => this.#storage.delete(key));
      return null;
    }
    return stored;
  }

  /**
   * Return the cached keypair, generating and persisting a fresh one if absent or expired.
   *
   * @remarks Deduplicates concurrent calls — simultaneous requests share one
   * generation promise. The dedup key is the signer address only: if two
   * warmups race for the same signer with different `chainId`s, the second
   * reuses the first. That is correct because the keypair is signer-scoped
   * and chain-independent — the chain only picks which relayer runs the
   * generation.
   */
  async getOrCreate(signerAddress: ChecksummedAddress, chainId?: number): Promise<StoredKeypair> {
    const existing = this.#pending.get(signerAddress);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const cached = await this.readStored(signerAddress);
      if (cached !== null) {
        return cached;
      }
      const fresh = await this.#generator(chainId);
      const createdAt = nowSeconds();
      const stored: StoredKeypair = {
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        createdAt,
        expiresAt: createdAt + this.#ttl,
      };
      const key = keypairStorageKey(signerAddress);
      await swallow("persist keypair", () => this.#storage.set(key, stored));
      return stored;
    })().finally(() => {
      this.#pending.delete(signerAddress);
    });

    this.#pending.set(signerAddress, promise);
    return promise;
  }

  /** Delete the stored keypair for the given address. */
  async clear(signerAddress: ChecksummedAddress): Promise<void> {
    const key = keypairStorageKey(signerAddress);
    await swallow("delete keypair entry", () => this.#storage.delete(key));
  }
}
