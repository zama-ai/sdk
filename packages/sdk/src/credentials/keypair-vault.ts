import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import type { Hex } from "viem";
import { KeyWrappingError } from "../errors/credential";
import type { ChecksummedAddress } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import { isUnwrapAuthFailure, unwrapPrivateKey, wrapPrivateKey } from "./keypair-wrapping";
import {
  StoredTransportKeyPairSchema,
  WrappedPrivateKeyEntrySchema,
  type WrappedPrivateKeyEntry,
} from "./schemas";
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
  /**
   * Opt-in at-rest wrapping for headless contexts with no secure storage backend to
   * delegate to (CLI tools, bare-metal agents, local dev). When set, the private key
   * half is encrypted before every `storage.set()` and decrypted after every
   * `storage.get()` — transparently, at this vault's storage boundary only. Undefined
   * preserves the default: plaintext, security delegated to the storage backend.
   */
  derivationSecret?: string | Uint8Array;
}

function scopeIdentity(scope: string): string {
  return `scope:${scope}`;
}

/**
 * Identity-scoped, chain-independent vault for ML-KEM transport key pairs.
 *
 * One transport key pair per signer address by default; the key pair survives chain
 * switches and permit revocations. When `scope` is configured, reads/creates key
 * off the shared scope identity instead of the signer address. {@link clear} always
 * targets the per-signer key regardless of scope — an individual signer's teardown must
 * never delete a scope's shared key pair. Only {@link clearScope} can do that.
 *
 * When `derivationSecret` is configured, the private key half is wrapped at rest — see
 * {@link keypair-wrapping}. This is invisible to every method here and to every caller
 * outside this class: `getOrCreate`/`readStored` always return the plaintext
 * {@link StoredTransportKeyPair} shape regardless of how it's actually stored on disk.
 */
export class TransportKeyPairVault {
  readonly #generator: () => Promise<SerializeTransportKeyPairReturnType>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;
  readonly #derivationSecret: string | Uint8Array | undefined;
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
    this.#derivationSecret = config.derivationSecret;
  }

  /**
   * Identity a wrapped key is bound to (the HKDF salt). Prefixed by kind so a scope
   * named after a checksummed address can never derive the same wrapping key as that
   * signer. Deliberately not the storage key string: that prefix is a storage-layer
   * detail, and renaming it must never stop already-wrapped keys from decrypting.
   */
  #identity(signerAddress: ChecksummedAddress): string {
    return this.#scope !== undefined ? scopeIdentity(this.#scope) : `signer:${signerAddress}`;
  }

  /** Storage key for reads/creates: the shared scope key when configured, else the per-signer key. */
  #identityKey(signerAddress: ChecksummedAddress): string {
    return this.#scope !== undefined
      ? transportKeyPairScopeStorageKey(this.#scope)
      : transportKeyPairStorageKey(signerAddress);
  }

  async readStored(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair | null> {
    return this.#readByKey(this.#identityKey(signerAddress), this.#identity(signerAddress));
  }

  async #readByKey(key: string, identity: string): Promise<StoredTransportKeyPair | null> {
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return null;
    }

    if (this.#derivationSecret === undefined) {
      const parsed = StoredTransportKeyPairSchema.safeParse(raw);
      if (!parsed.success) {
        if (this.#scope !== undefined && WrappedPrivateKeyEntrySchema.safeParse(raw).success) {
          // Discarding a scope's shared entry because this instance can't read it would
          // clobber a peer's valid, wrapped one and re-prompt the whole cohort.
          const message =
            `Transport key pair for scope "${this.#scope}" is wrapped, but this instance ` +
            "has no derivationSecret configured. Every instance sharing this scope must use " +
            "the same derivationSecret; once they do, call permits.revokeTransportKeyPair() " +
            "to rotate the entry.";
          this.#logger.error(message, { key });
          throw new KeyWrappingError(message, { cause: parsed.error });
        }
        await this.#discard(key, "malformed transport key pair entry");
        return null;
      }
      if (nowSeconds() >= parsed.data.expiresAt) {
        await this.#discard(key, "expired transport key pair entry");
        return null;
      }
      return parsed.data;
    }

    const parsed = WrappedPrivateKeyEntrySchema.safeParse(raw);
    if (!parsed.success) {
      if (this.#scope !== undefined) {
        // A scope's shared entry is never discarded to self-heal: regenerating would
        // clobber a peer's entry and re-prompt every signer in the cohort.
        const message = StoredTransportKeyPairSchema.safeParse(raw).success
          ? `Transport key pair for scope "${this.#scope}" is stored unwrapped, but this ` +
            "instance is configured with a derivationSecret. A peer instance sharing this " +
            "scope is running without the secret: configure the same derivationSecret " +
            "everywhere, then call permits.revokeTransportKeyPair() to migrate the scope " +
            "to a wrapped entry."
          : `Transport key pair for scope "${this.#scope}" is not a recognized wrapped or ` +
            "plaintext entry shape. This usually means the stored entry is corrupted, or " +
            "instances sharing this scope are running mismatched wrapping-scheme versions.";
        this.#logger.error(message, { key, error: parsed.error });
        throw new KeyWrappingError(message, { cause: parsed.error });
      }
      // Unscoped: also covers a plaintext entry left over from before derivationSecret
      // was configured, regenerated wrapped like any other cache miss.
      const reason = "malformed or unwrapped transport key pair entry";
      this.#logger.warn(reason, { key });
      await this.#discard(key, reason);
      return null;
    }
    const { publicKey, wrappedPrivateKey, iv, createdAt, expiresAt, tkmsVersion } = parsed.data;
    if (nowSeconds() >= expiresAt) {
      await this.#discard(key, "expired transport key pair entry");
      return null;
    }
    try {
      const privateKey = await unwrapPrivateKey(
        { wrappedPrivateKey, iv },
        this.#derivationSecret,
        identity,
        { publicKey, createdAt, expiresAt, tkmsVersion },
      );
      const entry: StoredTransportKeyPair = { publicKey, privateKey, createdAt, expiresAt };
      if (tkmsVersion) {
        entry.tkmsVersion = tkmsVersion;
      }
      return entry;
    } catch (error) {
      if (!isUnwrapAuthFailure(error)) {
        // Not a routine wrong-secret/tampered-entry failure — e.g. crypto.subtle
        // unavailable in this environment, or a malformed key import. Surface it
        // distinctly instead of silently discarding a perfectly good entry and
        // masking an environment problem as a routine cache miss.
        this.#logger.error("transport key pair unwrap failed unexpectedly", { key, error });
        throw new KeyWrappingError("Transport key pair unwrap failed unexpectedly.", {
          cause: error,
        });
      }
      if (this.#scope !== undefined) {
        // A shared scope's entry failing to unwrap doesn't necessarily mean it's
        // broken — the likeliest cause is another instance sharing this scope having
        // wrapped it under a different derivationSecret (inconsistent secret
        // propagation during a rollout), but AES-GCM's generic "OperationError" can't
        // actually distinguish that from genuine storage corruption (a truncated or
        // bit-flipped iv/ciphertext — see WrappedPrivateKeyEntrySchema's length checks
        // for the cases that *are* catchable pre-decrypt). Discarding and regenerating
        // here would clobber that instance's possibly valid entry and force every
        // signer in the scope to re-authenticate, repeatedly, for as long as both
        // configurations stay live. Fail loudly instead of silently corrupting a
        // resource the whole cohort shares.
        const message =
          `Transport key pair for scope "${this.#scope}" failed to unwrap. ` +
          "This usually means another instance created it with a different derivationSecret " +
          "— every instance sharing this scope must use the same secret. It can also mean " +
          "the stored entry is corrupted.";
        this.#logger.error(message, { key });
        throw new KeyWrappingError(message, { cause: error });
      }
      // Unscoped: only this signer is affected, so self-heal exactly like a malformed entry.
      const reason = "transport key pair entry failed to unwrap (wrong derivationSecret?)";
      this.#logger.warn(reason, { key });
      await this.#discard(key, reason);
      return null;
    }
  }

  async #discard(key: string, reason: string): Promise<void> {
    await swallow(reason, () => this.#storage.delete(key), this.#logger);
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
   *
   * @throws if `derivationSecret` is configured together with `scope` and the stored
   *   entry fails to unwrap — deliberately not self-healed, since silently regenerating
   *   would overwrite a scope's shared entry that may simply be wrapped under a
   *   different (but valid) `derivationSecret` by another instance. See `#readByKey`
   *   for the equivalent unscoped, self-healing case. {@link KeyWrappingError}
   * @throws if wrapping the freshly generated private key fails (e.g. `crypto.subtle`
   *   unavailable in this environment). {@link KeyWrappingError}
   */
  async getOrCreate(signerAddress: ChecksummedAddress): Promise<StoredTransportKeyPair> {
    return this.#getOrCreateByKey(this.#identityKey(signerAddress), this.#identity(signerAddress));
  }

  /**
   * @param strict - When `true`, a `storage.set` failure during persistence rejects
   *   instead of being logged and swallowed. Used by {@link warmScope}, which — like
   *   {@link clearScope} — must not resolve successfully while its write silently failed.
   */
  async #getOrCreateByKey(
    key: string,
    identity: string,
    options?: { strict?: boolean },
  ): Promise<StoredTransportKeyPair> {
    const strict = options?.strict ?? false;
    // Keyed on (key, strict), not key alone: a strict caller (warmScope) and a
    // non-strict caller (getOrCreate) can target the same shared scope identity, and
    // must never adopt each other's persistence guarantee — whichever registers first
    // would otherwise silently impose its strictness on the other. See the strict
    // param doc above.
    const pendingKey = `${key}::${strict}`;
    const existing = this.#pending.get(pendingKey);
    if (existing) {
      return existing;
    }

    const epochAtStart = this.#epoch.get(key) ?? 0;

    const promise = (async () => {
      const cached = await this.#readByKey(key, identity);
      if (cached !== null) {
        return cached;
      }
      const fresh = await this.#generator();
      const createdAt = nowSeconds();
      const expiresAt = createdAt + this.#ttl;
      const stored: StoredTransportKeyPair = {
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        createdAt,
        expiresAt,
      };
      // Persist the TKMS version so a later parse deserializes the private key
      // under the version it was generated with, surviving a KMS/TKMS rotation.
      if (fresh.tkmsVersion) {
        stored.tkmsVersion = fresh.tkmsVersion;
      }

      let entry: StoredTransportKeyPair | WrappedPrivateKeyEntry = stored;
      if (this.#derivationSecret !== undefined) {
        let wrappedPrivateKey: Hex;
        let iv: Hex;
        try {
          ({ wrappedPrivateKey, iv } = await wrapPrivateKey(
            fresh.privateKey,
            this.#derivationSecret,
            identity,
            { publicKey: fresh.publicKey, createdAt, expiresAt, tkmsVersion: stored.tkmsVersion },
          ));
        } catch (error) {
          const message = "Failed to wrap the transport private key for at-rest storage.";
          this.#logger.error(message, { key, error });
          throw new KeyWrappingError(message, { cause: error });
        }
        const wrapped: WrappedPrivateKeyEntry = {
          publicKey: fresh.publicKey,
          wrappedPrivateKey,
          iv,
          createdAt,
          expiresAt,
        };
        if (stored.tkmsVersion) {
          wrapped.tkmsVersion = stored.tkmsVersion;
        }
        entry = wrapped;
      }

      // If a rotation bumped this key's epoch while `#generator()` (and, when
      // derivationSecret is configured, the wrap above) were in flight, this
      // generation started before the rotation and must not persist — doing so would
      // silently resurrect the key the rotation just deleted (see `clearScope`). The
      // freshly generated key pair is still returned to whichever caller triggered this
      // round trip so their in-flight request succeeds; the next access regenerates and
      // persists properly against the new epoch.
      if ((this.#epoch.get(key) ?? 0) === epochAtStart) {
        if (strict) {
          await this.#storage.set(key, entry);
        } else {
          await swallow(
            "persist transport key pair",
            () => this.#storage.set(key, entry),
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
   * Delete the stored key pair for this identity so the next {@link getOrCreate}
   * regenerates it. Unlike {@link clear}, this is **scope-aware** — it targets the
   * shared scope key when a scope is configured, else the per-signer key.
   *
   * The self-heal primitive for a key pair the relayer rejects as invalid (e.g. a
   * TKMS-version mismatch after a KMS rotation, which surfaces as
   * `invalid TransportKeyPairKeyPair`): the stored bytes can no longer be parsed,
   * so dropping and regenerating them is the only recovery. Best-effort — a
   * storage failure is logged and swallowed, so a wedged entry is retried on the
   * next call rather than hard-failing the current one.
   */
  async evict(signerAddress: ChecksummedAddress): Promise<void> {
    const key = this.#identityKey(signerAddress);
    await swallow("evict transport key pair entry", () => this.#storage.delete(key), this.#logger);
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
    await this.#getOrCreateByKey(
      transportKeyPairScopeStorageKey(this.#scope),
      scopeIdentity(this.#scope),
      { strict: true },
    );
  }
}
