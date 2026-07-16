import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import type { ChecksummedAddress } from "../../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../../types";
import { swallow } from "../../utils/swallow";
import { StoredTransportKeyPairSchema } from "../schemas";
import { transportKeyPairScopeStorageKey, transportKeyPairStorageKey } from "./storage-keys";
import type { StoredTransportKeyPair } from "../types";
import { nowSeconds } from "../utils";

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
 * switches and permit revocations. When `scope` is configured, reads/creates key
 * off the shared scope identity instead of the signer address. {@link clear} always
 * targets the per-signer key regardless of scope — an individual signer's teardown must
 * never delete a scope's shared key pair. Only {@link clearScope} can do that.
 */
export class TransportKeyPairVault {
  readonly #generator: () => Promise<SerializeTransportKeyPairReturnType>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;
  readonly #pending = new Map<string, Promise<StoredTransportKeyPair>>();
  /**
   * Per-key generation counter, bumped by {@link clearScope}. Lets a generation that
   * was already in flight when a rotation happened detect it's stale once its
   * `#generator()` round trip completes, so it skips persisting a key that would
   * silently resurrect the one the rotation just deleted.
   */
  readonly #epoch = new Map<string, number>();

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
    return this.#readByKey(this.#identityKey(signerAddress));
  }

  async #readByKey(key: string): Promise<StoredTransportKeyPair | null> {
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
   * @remarks Deduplicates concurrent calls within this process. Across separate
   * processes/instances sharing a scope, two first-time callers can still race the
   * underlying storage — unlike the per-signer version of this race, the loser here can
   * be a *different* end-user, whose existing permit then gets silently pruned as stale.
   * Pre-warm a scope once via {@link warmScope} before opening concurrent traffic to
   * avoid hitting this with a whole cohort at once.
   */
  async getOrCreate(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair> {
    return this.#getOrCreateByKey(this.#identityKey(signerAddress));
  }

  /**
   * @param strict - When `true`, a `storage.set` failure during persistence rejects
   *   instead of being logged and swallowed. Used by {@link warmScope}, which — like
   *   {@link clearScope} — must not resolve successfully while its write silently failed.
   */
  async #getOrCreateByKey(
    identityKey: string,
    options?: { strict?: boolean },
  ): Promise<StoredTransportKeyPair> {
    const strict = options?.strict ?? false;
    // Keyed on (identityKey, strict), not identityKey alone: a strict caller
    // (warmScope) and a non-strict caller (getOrCreate) can target the same shared
    // scope identity, and must never adopt each other's persistence guarantee —
    // whichever registers first would otherwise silently impose its strictness on
    // the other. See the strict param doc above.
    const pendingKey = `${identityKey}::${strict}`;
    const existing = this.#pending.get(pendingKey);
    if (existing) {
      return existing;
    }

    const epochAtStart = this.#epoch.get(identityKey) ?? 0;

    const promise = (async () => {
      const cached = await this.#readByKey(identityKey);
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
      // If a rotation bumped this key's epoch while `#generator()` was in flight, this
      // generation started before the rotation and must not persist — doing so would
      // silently resurrect the key the rotation just deleted (see `clearScope`). The
      // freshly generated key pair is still returned to whichever caller triggered this
      // round trip so their in-flight request succeeds; the next access regenerates and
      // persists properly against the new epoch.
      if ((this.#epoch.get(identityKey) ?? 0) === epochAtStart) {
        if (options?.strict) {
          await this.#storage.set(identityKey, stored);
        } else {
          await swallow(
            "persist transport key pair",
            () => this.#storage.set(identityKey, stored),
            this.#logger,
          );
        }
      }
      return stored;
    })().finally(() => {
      this.#pending.delete(pendingKey);
    });

    this.#pending.set(pendingKey, promise);
    return promise;
  }

  /**
   * Delete the stored transport key pair for the given signer address.
   *
   * Always targets the per-signer key, never the shared scope key — even when this
   * vault is configured with a scope. Signer-level teardown (disconnect, revoke) must
   * never take down a shared-tenant key pair; use {@link clearScope} for that.
   *
   * Best-effort: a storage failure is logged and swallowed. Worst case, one signer's
   * stale key lingers until its TTL — a low-stakes, self-correcting outcome.
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
   *
   * Unlike {@link clear}, this is **not** best-effort: a storage failure propagates
   * instead of being swallowed. This is the primitive operators reach for on suspected
   * key compromise — a caller that gets a resolved promise must be able to trust that
   * the key pair is actually gone, not silently still live because a transient storage
   * error (exactly the kind of failure likely during an incident) was logged and
   * dropped.
   *
   * Also bumps the key's generation epoch *before* deleting, so a `getOrCreate`/
   * `warmScope` generation already in flight for this same scope discards its result
   * instead of persisting it once the round trip completes — otherwise that write would
   * land after this delete and silently resurrect the key this call just removed. This
   * relies on the backing {@link GenericStorage} applying same-key writes in dispatch
   * order — true for `MemoryStorage` and conventional stores, but a custom async
   * adapter without that guarantee could still let an in-flight `set` land after this
   * `delete`.
   */
  async clearScope(): Promise<void> {
    if (this.#scope === undefined) {
      return;
    }
    const key = transportKeyPairScopeStorageKey(this.#scope);
    this.#epoch.set(key, (this.#epoch.get(key) ?? 0) + 1);
    await this.#storage.delete(key);
  }

  /**
   * Generate and persist the shared scope's transport key pair if absent — the
   * pre-warm counterpart to {@link clearScope}. No-op if no scope is configured.
   *
   * Unlike {@link getOrCreate}, this needs no signer address at all: a scoped identity
   * never depends on one. Operators use this to warm a scope once, deliberately,
   * before opening concurrent traffic to it — see the class docs on {@link getOrCreate}
   * for why that avoids a thundering-herd race across the whole cohort.
   *
   * Not best-effort: like {@link clearScope}, a `storage.set` failure during persistence
   * propagates instead of being swallowed. A resolved promise here is meant to mean the
   * key pair is actually warmed in shared storage — an operator pre-warming ahead of
   * traffic to avoid the thundering-herd race must be able to trust that, not silently
   * still be exposed to it because a transient write failure was logged and dropped.
   */
  async warmScope(): Promise<void> {
    if (this.#scope === undefined) {
      return;
    }
    await this.#getOrCreateByKey(transportKeyPairScopeStorageKey(this.#scope), { strict: true });
  }
}
