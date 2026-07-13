import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import type { ChecksummedAddress } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import { StoredTransportKeyPairSchema } from "./schemas";
import { transportKeyPairScopeStorageKey, transportKeyPairStorageKey } from "./storage-keys";
import type { StoredTransportKeyPair } from "./types";
import { nowSeconds } from "./utils";

interface TransportKeyPairVaultConfig {
  generator: () => Promise<SerializeTransportKeyPairReturnType>;
  storage: GenericStorage;
  /** Transport key pair lifetime in seconds. Pre-validated by the caller. */
  ttl: number;
  /** SDK-wide logger for best-effort storage diagnostics. */
  logger: GenericLogger;
  /**
   * Opt-in shared-tenant scope (B2B2C/WaaS). When set, every signer configured with
   * this scope reads/creates the *same* key pair instead of one per signer address.
   * Undefined preserves the default per-signer behavior.
   */
  scope?: string;
}

/**
 * Identity-scoped, chain-independent vault for ML-KEM transport key pairs.
 *
 * One transport key pair per signer address by default; the key pair survives chain
 * switches and permit revocations. When a `scope` is configured, reads/creates key off
 * the shared scope identity instead of the signer address. {@link clear} always targets
 * the per-signer key regardless of scope — an individual signer's teardown must never
 * delete a scope's shared key pair. Only {@link clearScope} can do that.
 */
export class TransportKeyPairVault {
  readonly #generator: () => Promise<SerializeTransportKeyPairReturnType>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;
  readonly #pending = new Map<string, Promise<StoredTransportKeyPair>>();

  constructor(config: TransportKeyPairVaultConfig) {
    this.#generator = config.generator;
    this.#storage = config.storage;
    this.#ttl = config.ttl;
    this.#logger = config.logger;
    this.#scope = config.scope;
  }

  /** Storage identity for reads/creates: the shared scope key when configured, else the per-signer key. */
  #identityKey(signerAddress: ChecksummedAddress): string {
    return this.#scope !== undefined
      ? transportKeyPairScopeStorageKey(this.#scope)
      : transportKeyPairStorageKey(signerAddress);
  }

  async readStored(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair | null> {
    const key = this.#identityKey(signerAddress);
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
   * @remarks Deduplicates concurrent calls within this process — simultaneous requests
   * share one generation promise. Across separate processes/instances sharing a scope,
   * two first-time callers can still race the underlying storage; the loser's write
   * wins or loses on `storage.set` ordering, and the next read converges on whichever
   * entry survives. This mirrors the pre-existing per-signer race (multiple tabs/processes
   * for one signer) — a scope just makes it more likely because more callers share one key.
   */
  async getOrCreate(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair> {
    const identityKey = this.#identityKey(signerAddress);
    const existing = this.#pending.get(identityKey);
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
      await swallow(
        "persist transport key pair",
        () => this.#storage.set(identityKey, stored),
        this.#logger,
      );
      return stored;
    })().finally(() => {
      this.#pending.delete(identityKey);
    });

    this.#pending.set(identityKey, promise);
    return promise;
  }

  /**
   * Delete the stored transport key pair for the given signer address.
   *
   * Always targets the per-signer key, never the shared scope key — even when this
   * vault is configured with a scope. Signer-level teardown (disconnect, revoke) must
   * never take down a shared-tenant key pair; use {@link clearScope} for that.
   */
  async clear(signerAddress: ChecksummedAddress): Promise<void> {
    const key = transportKeyPairStorageKey(signerAddress);
    await swallow("delete transport key pair entry", () => this.#storage.delete(key), this.#logger);
  }

  /**
   * Delete the shared scope's transport key pair (operator-level rotation).
   *
   * Every permit in the scope embeds the old key pair's public key, so once it's gone,
   * `pruneUnusable` drops all of them as stale on next access — no separate permit
   * cleanup needed. No-op if no scope is configured on this vault.
   */
  async clearScope(): Promise<void> {
    if (this.#scope === undefined) {
      return;
    }
    const key = transportKeyPairScopeStorageKey(this.#scope);
    await swallow(
      "delete scoped transport key pair entry",
      () => this.#storage.delete(key),
      this.#logger,
    );
  }
}
