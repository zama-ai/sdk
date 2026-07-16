import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import type { ChecksummedAddress } from "../../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../../types";
import { swallow } from "../../utils/swallow";
import { StoredTransportKeyPairSchema } from "../schemas";
import { transportKeyPairStorageKey } from "./storage-keys";
import type { StoredTransportKeyPair } from "../types";
import { nowSeconds } from "../utils";

interface TransportKeyPairVaultConfig {
  generator: () => Promise<SerializeTransportKeyPairReturnType>;
  storage: GenericStorage;
  /** Transport key pair lifetime in seconds. Pre-validated by the caller. */
  ttl: number;
  /** SDK-wide logger for best-effort storage diagnostics. */
  logger: GenericLogger;
}

/**
 * Identity-scoped, chain-independent vault for ML-KEM transport key pairs.
 *
 * One transport key pair per signer address; the key pair survives chain switches and
 * permit revocations. Storage entries are keyed only by the signer address.
 */
export class TransportKeyPairVault {
  readonly #generator: () => Promise<SerializeTransportKeyPairReturnType>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #logger: GenericLogger;
  readonly #pending = new Map<ChecksummedAddress, Promise<StoredTransportKeyPair>>();

  constructor(config: TransportKeyPairVaultConfig) {
    this.#generator = config.generator;
    this.#storage = config.storage;
    this.#ttl = config.ttl;
    this.#logger = config.logger;
  }

  async readStored(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair | null> {
    const key = transportKeyPairStorageKey(signerAddress);
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return null;
    }
    const parsed = StoredTransportKeyPairSchema.safeParse(raw);
    if (!parsed.success) {
      await swallow(
        "delete transport key pair entry",
        () => this.#storage.delete(key),
        this.#logger,
      );
      return null;
    }
    const stored = parsed.data;
    if (nowSeconds() >= stored.expiresAt) {
      await swallow(
        "delete transport key pair entry",
        () => this.#storage.delete(key),
        this.#logger,
      );
      return null;
    }
    return stored;
  }

  /**
   * Return the cached transport key pair, generating and persisting a fresh one if absent or expired.
   *
   * @remarks Deduplicates concurrent calls — simultaneous requests share one generation promise.
   */
  async getOrCreate(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair> {
    const existing = this.#pending.get(signerAddress);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const cached = await this.readStored(signerAddress);
      if (cached !== null) {
        return cached;
      }
      const fresh = await this.#generator();
      const createdAt = nowSeconds();
      const stored: StoredTransportKeyPair = {
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        createdAt,
        expiresAt: createdAt + this.#ttl,
      };
      const key = transportKeyPairStorageKey(signerAddress);
      await swallow(
        "persist transport key pair",
        () => this.#storage.set(key, stored),
        this.#logger,
      );
      return stored;
    })().finally(() => {
      this.#pending.delete(signerAddress);
    });

    this.#pending.set(signerAddress, promise);
    return promise;
  }

  /** Delete the stored transport key pair for the given address. */
  async clear(signerAddress: ChecksummedAddress): Promise<void> {
    const key = transportKeyPairStorageKey(signerAddress);
    await swallow("delete transport key pair entry", () => this.#storage.delete(key), this.#logger);
  }
}
