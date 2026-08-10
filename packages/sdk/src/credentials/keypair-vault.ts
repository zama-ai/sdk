import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { KeyWrappingError } from "../errors/credential";
import type { ChecksummedAddress } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import {
  classifyPersistedEntry,
  encodeWrappedEntry,
  type PersistedTransportKeyPair,
} from "./keypair-entry-codec";
import { isUnwrapAuthFailure, type DerivationSecretHolder } from "./keypair-wrapping";
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
  derivationSecret?: DerivationSecretHolder;
}

function scopeIdentity(scope: string): string {
  return `scope:${scope}`;
}

/** Why a stored entry can't be served to this instance. */
type RecoveryReason =
  | "wrapped-without-secret"
  | "unwrapped-under-secret"
  | "unwrap-failed"
  | "corrupt-wrapped";

/** Operator-facing diagnostic for a scope whose shared entry is left in place. */
function scopedFailureMessage(reason: RecoveryReason, scope: string): string {
  const messages: Record<RecoveryReason, string> = {
    "wrapped-without-secret":
      `Transport key pair for scope "${scope}" is wrapped, but this instance has no ` +
      "transportKeyPairDerivationSecret configured. Every instance sharing this scope must use " +
      "the same transportKeyPairDerivationSecret; once they do, call " +
      "permits.revokeTransportKeyPair() to rotate the entry.",
    "unwrapped-under-secret":
      `Transport key pair for scope "${scope}" is stored unwrapped, but this instance is ` +
      "configured with a transportKeyPairDerivationSecret. A peer instance sharing this scope " +
      "is running without the secret: configure the same transportKeyPairDerivationSecret " +
      "everywhere, then call permits.revokeTransportKeyPair() to migrate the scope to a " +
      "wrapped entry.",
    "unwrap-failed":
      `Transport key pair for scope "${scope}" failed to unwrap. This usually means another ` +
      "instance created it with a different transportKeyPairDerivationSecret: every instance " +
      "sharing this scope must use the same secret. It can also mean the stored entry is " +
      "corrupted.",
    "corrupt-wrapped":
      `Transport key pair for scope "${scope}" is wrapped but structurally invalid: the stored ` +
      "iv or ciphertext is not a shape this wrapping scheme can produce. This usually means " +
      "the stored entry is corrupted, or instances sharing this scope are running mismatched " +
      "wrapping-scheme versions.",
  };
  return messages[reason];
}

/**
 * Operator-facing diagnostic for a per-signer entry this instance can't read at all: a
 * missing secret is a deployment mistake far more often than an intentional downgrade,
 * and self-healing would drop at-rest wrapping without anyone noticing.
 */
const UNSCOPED_WRAPPED_WITHOUT_SECRET_MESSAGE =
  "Transport key pair for this signer is wrapped, but this instance has no " +
  "transportKeyPairDerivationSecret configured. Configure the same " +
  "transportKeyPairDerivationSecret the entry was written with. To downgrade to plaintext " +
  "at rest on purpose, discard the stored entry first by calling " +
  "permits.clearCredentials(), then run without the secret.";

/** Discard reason for a per-signer entry, which self-heals instead of failing loudly. */
const UNSCOPED_FAILURE_REASONS: Record<
  Exclude<RecoveryReason, "wrapped-without-secret">,
  string
> = {
  "unwrapped-under-secret":
    "unwrapped transport key pair entry found while a transportKeyPairDerivationSecret is configured",
  "unwrap-failed":
    "transport key pair entry failed to unwrap (wrong transportKeyPairDerivationSecret?)",
  "corrupt-wrapped": "structurally invalid wrapped transport key pair entry",
};

function unsupportedVersionMessage(version: unknown, scope: string | undefined): string {
  const label =
    typeof version === "number"
      ? `wrappingVersion ${version}`
      : "no wrappingVersion this build recognizes";
  const target = scope !== undefined ? `for scope "${scope}"` : "for this signer";
  const remedy =
    scope !== undefined
      ? "run a build that supports it everywhere, or call permits.revokeTransportKeyPair() to rotate the scope"
      : "run a build that supports it, or call permits.clearCredentials() to discard the entry deliberately";
  return (
    `Transport key pair ${target} was written under a wrapping scheme this SDK build cannot ` +
    `read (${label}). The entry is preserved instead of regenerated, since an instance that ` +
    `understands the scheme may still be using it: ${remedy}.`
  );
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
 * When `derivationSecret` is configured, the private key half is wrapped at rest. That is
 * invisible to every method here and to every caller outside this class: `getOrCreate`/
 * `readStored` always return the plaintext {@link StoredTransportKeyPair} shape regardless
 * of how the entry is actually stored on disk.
 */
export class TransportKeyPairVault {
  readonly #generator: () => Promise<SerializeTransportKeyPairReturnType>;
  readonly #storage: GenericStorage;
  readonly #ttl: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;
  readonly #derivationSecret: DerivationSecretHolder | undefined;
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

    const entry = classifyPersistedEntry(raw);
    if (entry.kind === "unsupported-version") {
      // Preserved for every configuration, scoped or not: only a build that knows the
      // scheme can read this ciphertext, and regenerating would destroy it for good.
      throw this.#failLoudly(key, unsupportedVersionMessage(entry.version, this.#scope));
    }

    if (entry.kind === "unrecognized") {
      // Neither shape holds a key pair any instance could read, so there is nothing to
      // protect by keeping it, scope or no scope.
      await this.#discard(key, "malformed transport key pair entry");
      return null;
    }

    const derivationSecret = this.#derivationSecret;
    if (derivationSecret === undefined) {
      if (entry.kind === "plaintext") {
        return (await this.#discardIfExpired(key, entry.keyPair.expiresAt)) ? null : entry.keyPair;
      }
      // Corrupt or intact, a wrapped entry is unreadable here for the same single reason.
      return this.#recover(key, "wrapped-without-secret");
    }

    if (entry.kind === "plaintext") {
      return this.#recover(key, "unwrapped-under-secret");
    }
    if (entry.kind === "corrupt-wrapped") {
      return this.#recover(key, "corrupt-wrapped");
    }
    if (await this.#discardIfExpired(key, entry.expiresAt)) {
      return null;
    }

    try {
      return await entry.decode(derivationSecret, identity);
    } catch (error) {
      if (!isUnwrapAuthFailure(error)) {
        // Not a wrong secret or a tampered entry but an environment problem (e.g.
        // crypto.subtle unavailable), which must not read as a routine cache miss.
        this.#logger.error("transport key pair unwrap failed unexpectedly", { key, error });
        throw new KeyWrappingError("Transport key pair unwrap failed unexpectedly.", {
          cause: error,
        });
      }
      return this.#recover(key, "unwrap-failed", error);
    }
  }

  /**
   * The one place that decides what happens to an entry this instance can't serve. A
   * scope's entry is shared, and AES-GCM can't distinguish a peer's valid entry wrapped
   * under a different secret from genuine corruption, so discarding it risks clobbering a
   * key pair the whole cohort is using: scoped vaults fail loudly and leave it in place,
   * unscoped ones self-heal since only this signer is affected. The one unscoped case that
   * also fails loudly is a wrapped entry with no secret configured, where self-healing
   * would turn a missing secret into a silent plaintext downgrade.
   */
  async #recover(key: string, reason: RecoveryReason, cause?: unknown): Promise<null> {
    if (this.#scope !== undefined) {
      throw this.#failLoudly(key, scopedFailureMessage(reason, this.#scope), cause);
    }
    if (reason === "wrapped-without-secret") {
      throw this.#failLoudly(key, UNSCOPED_WRAPPED_WITHOUT_SECRET_MESSAGE, cause);
    }
    const discardReason = UNSCOPED_FAILURE_REASONS[reason];
    // Warned, not just discarded: a regenerated entry can silently lose the at-rest
    // wrapping the discarded one had.
    this.#logger.warn(discardReason, { key });
    await this.#discard(key, discardReason);
    return null;
  }

  /** Logged where the storage key is still in hand, then thrown for the caller to act on. */
  #failLoudly(key: string, message: string, cause?: unknown): KeyWrappingError {
    this.#logger.error(message, { key });
    return new KeyWrappingError(message, { cause });
  }

  /** An entry past its TTL is a cache miss: dropped so the next call regenerates it. */
  async #discardIfExpired(key: string, expiresAt: number): Promise<boolean> {
    if (nowSeconds() < expiresAt) {
      return false;
    }
    await this.#discard(key, "expired transport key pair entry");
    return true;
  }

  async #discard(key: string, reason: string): Promise<void> {
    this.#logger.debug("discarding transport key pair entry", { key, reason });
    await swallow("delete transport key pair entry", () => this.#storage.delete(key), this.#logger);
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
   * @throws if the stored entry was written under a wrapping scheme this build cannot
   *   read, in any configuration: it is preserved rather than regenerated over.
   *   {@link KeyWrappingError}
   * @throws if the stored entry is wrapped and no `derivationSecret` is configured, in
   *   any configuration: regenerating would downgrade this signer to plaintext at rest
   *   without a signal. {@link KeyWrappingError}
   * @throws if `derivationSecret` is configured together with `scope` and the stored
   *   entry can't be served (fails to unwrap, or is stored in an unexpected shape),
   *   since silently regenerating would overwrite a scope's shared entry that may simply
   *   be wrapped under a different (but valid) `derivationSecret` by another instance.
   *   The unscoped equivalent self-heals. {@link KeyWrappingError}
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

      let entry: PersistedTransportKeyPair = stored;
      if (this.#derivationSecret !== undefined) {
        try {
          entry = await encodeWrappedEntry(stored, this.#derivationSecret, identity);
        } catch (error) {
          const message = "Failed to wrap the transport private key for at-rest storage.";
          this.#logger.error(message, { key, error });
          throw new KeyWrappingError(message, { cause: error });
        }
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
