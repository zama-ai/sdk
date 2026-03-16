import type { GenericStorage } from "../token/token.types";
import type { GenericLogger } from "../worker/worker.types";

/** Cached shape for the FHE network public key. */
interface CachedPublicKey {
  publicKeyId: string;
  /** Base64-encoded Uint8Array. */
  publicKey: string;
  lastValidatedAt?: number;
}

/** Cached shape for FHE public params. */
interface CachedPublicParams {
  publicParamsId: string;
  /** Base64-encoded Uint8Array. */
  publicParams: string;
  lastValidatedAt?: number;
}

/** Return type of the public key fetcher. */
type PublicKeyResult = { publicKeyId: string; publicKey: Uint8Array } | null;

/** Return type of the public params fetcher. */
type PublicParamsResult = {
  publicParamsId: string;
  publicParams: Uint8Array;
} | null;

/** Max chunk size for String.fromCharCode to avoid call-stack overflow on large buffers. */
const CHUNK_SIZE = 8192;

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pubkeyStorageKey(chainId: number): string {
  return `fhe:pubkey:${chainId}`;
}

function paramsStorageKey(chainId: number, bits: number): string {
  return `fhe:params:${chainId}:${bits}`;
}

/**
 * Persistent cache for FHE network public key and public params.
 * Uses a {@link GenericStorage} backend (e.g. MemoryStorage, or any
 * user-provided async key-value adapter) to avoid re-downloading large
 * binary data on every app instantiation.
 *
 * Cache keys are scoped by chain ID.
 */
export class PublicParamsCache {
  readonly #storage: GenericStorage;
  readonly #chainId: number;
  readonly #relayerUrl: string;
  readonly #revalidateIntervalMs: number;
  readonly #logger?: GenericLogger;
  #publicKeyMem: PublicKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<PublicKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();
  /** In-memory guard to skip storage reads when revalidation isn't due. */
  #lastRevalidatedAt: number | null = null;

  constructor(opts: {
    storage: GenericStorage;
    chainId: number;
    relayerUrl: string;
    revalidateIntervalMs?: number;
    logger?: GenericLogger;
  }) {
    this.#storage = opts.storage;
    this.#chainId = opts.chainId;
    this.#relayerUrl = opts.relayerUrl;
    this.#revalidateIntervalMs = opts.revalidateIntervalMs ?? 86_400_000;
    this.#logger = opts.logger;
  }

  async getPublicKey(fetcher: () => Promise<PublicKeyResult>): Promise<PublicKeyResult> {
    if (this.#publicKeyMem !== undefined) return this.#publicKeyMem;

    // Deduplicate concurrent calls
    if (this.#publicKeyInflight) return this.#publicKeyInflight;

    this.#publicKeyInflight = this.#loadPublicKey(fetcher);
    try {
      return await this.#publicKeyInflight;
    } finally {
      this.#publicKeyInflight = null;
    }
  }

  async #loadPublicKey(fetcher: () => Promise<PublicKeyResult>): Promise<PublicKeyResult> {
    const key = pubkeyStorageKey(this.#chainId);

    try {
      const stored = await this.#storage.get<CachedPublicKey>(key);
      if (stored) {
        const result: PublicKeyResult = {
          publicKeyId: stored.publicKeyId,
          publicKey: fromBase64(stored.publicKey),
        };
        this.#publicKeyMem = result;
        return result;
      }
    } catch (err) {
      this.#logger?.warn(
        "Failed to read public key from persistent storage, falling back to network fetch",
        {
          chainId: this.#chainId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    const result = await fetcher();
    if (result === null) return null;

    this.#publicKeyMem = result;

    try {
      const cached: CachedPublicKey = {
        publicKeyId: result.publicKeyId,
        publicKey: toBase64(result.publicKey),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, cached);
    } catch (err) {
      this.#logger?.warn("Failed to persist public key to storage", {
        chainId: this.#chainId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  async getPublicParams(
    bits: number,
    fetcher: () => Promise<PublicParamsResult>,
  ): Promise<PublicParamsResult> {
    const mem = this.#publicParamsMem.get(bits);
    if (mem !== undefined) return mem;

    // Deduplicate concurrent calls
    const inflight = this.#publicParamsInflight.get(bits);
    if (inflight) return inflight;

    const promise = this.#loadPublicParams(bits, fetcher);
    this.#publicParamsInflight.set(bits, promise);
    try {
      return await promise;
    } finally {
      this.#publicParamsInflight.delete(bits);
    }
  }

  async #loadPublicParams(
    bits: number,
    fetcher: () => Promise<PublicParamsResult>,
  ): Promise<PublicParamsResult> {
    const key = paramsStorageKey(this.#chainId, bits);

    try {
      const stored = await this.#storage.get<CachedPublicParams>(key);
      if (stored) {
        const result: PublicParamsResult = {
          publicParamsId: stored.publicParamsId,
          publicParams: fromBase64(stored.publicParams),
        };
        this.#publicParamsMem.set(bits, result);
        return result;
      }
    } catch (err) {
      this.#logger?.warn(
        "Failed to read public params from persistent storage, falling back to network fetch",
        {
          chainId: this.#chainId,
          bits,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    const result = await fetcher();
    if (result === null) return null;

    this.#publicParamsMem.set(bits, result);

    try {
      const cached: CachedPublicParams = {
        publicParamsId: result.publicParamsId,
        publicParams: toBase64(result.publicParams),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, cached);
    } catch (err) {
      this.#logger?.warn("Failed to persist public params to storage", {
        chainId: this.#chainId,
        bits,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  // ── Artifact-level revalidation ──────────────────────────────

  /**
   * Check whether cached FHE artifacts are still fresh by comparing the
   * relayer manifest (`/keyurl`) dataIds against cached values.
   *
   * @returns `true` if the cache was invalidated and the caller should
   *   re-fetch artifacts, `false` otherwise.
   */
  async revalidateIfDue(): Promise<boolean> {
    // Fast path: in-memory timestamp check avoids storage I/O on every call
    const now = Date.now();
    if (
      this.#lastRevalidatedAt != null &&
      now - this.#lastRevalidatedAt < this.#revalidateIntervalMs
    ) {
      return false;
    }

    const pkKey = pubkeyStorageKey(this.#chainId);

    // Track partial progress so the catch block can reuse already-read data
    let storedPk: CachedPublicKey | null = null;
    let paramEntries: Array<{
      bits: number;
      key: string;
      data: CachedPublicParams;
    }> = [];

    try {
      // 1. Read PK cache entry and collect params entries in parallel
      const [pk, entries] = await Promise.all([
        this.#storage.get<CachedPublicKey>(pkKey),
        this.#collectParamEntries(),
      ]);
      storedPk = pk ?? null;
      paramEntries = entries;

      if (!storedPk) return false;

      // 2. Check if all entries are within intervalMs
      const allEntries: Array<{ lastValidatedAt?: number }> = [
        storedPk,
        ...paramEntries.map((e) => e.data),
      ];
      const allFresh = allEntries.every(
        (e) => e.lastValidatedAt != null && now - e.lastValidatedAt < this.#revalidateIntervalMs,
      );
      if (allFresh) {
        this.#lastRevalidatedAt = now;
        return false;
      }

      // 3. Fetch manifest
      const manifestRes = await globalThis.fetch(`${this.#relayerUrl}/keyurl`);
      if (!manifestRes.ok) {
        this.#logger?.warn("Manifest fetch failed during revalidation, treating cache as fresh", {
          status: manifestRes.status,
          relayerUrl: this.#relayerUrl,
        });
        await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
        this.#lastRevalidatedAt = now;
        return false;
      }
      const manifest = (await manifestRes.json()) as {
        fhePublicKey?: { dataId?: string; urls?: string[] };
        crs?: Record<string, { dataId?: string; urls?: string[] }>;
      };

      // 4. Check public key freshness via dataId
      const manifestPkId = manifest.fhePublicKey?.dataId;
      if (manifestPkId && manifestPkId !== storedPk.publicKeyId) {
        await this.#clearAll(pkKey, paramEntries);
        this.#lastRevalidatedAt = null;
        return true;
      }

      // 5. Check each CRS entry via dataId
      for (const entry of paramEntries) {
        const manifestCrs = manifest.crs?.[String(entry.bits)];
        const manifestCrsId = manifestCrs?.dataId;

        if (manifestCrsId && manifestCrsId !== entry.data.publicParamsId) {
          await this.#clearAll(pkKey, paramEntries);
          this.#lastRevalidatedAt = null;
          return true;
        }
      }

      // 6. All fresh — update timestamps
      await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
      this.#lastRevalidatedAt = now;
      return false;
    } catch (err) {
      this.#logger?.warn("Revalidation failed, using cached artifacts (fail-open)", {
        chainId: this.#chainId,
        relayerUrl: this.#relayerUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-open: try to update timestamps to prevent retry storm.
      // Reuse already-read data when available to avoid redundant storage reads.
      try {
        if (storedPk) {
          await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, Date.now());
        }
      } catch (innerErr) {
        this.#logger?.warn("Failed to update validation timestamps after revalidation error", {
          chainId: this.#chainId,
          error: innerErr instanceof Error ? innerErr.message : String(innerErr),
        });
      }
      this.#lastRevalidatedAt = now;
      return false;
    }
  }

  async #collectParamEntries(): Promise<
    Array<{ bits: number; key: string; data: CachedPublicParams }>
  > {
    const bitsArray = Array.from(this.#publicParamsMem.keys());
    const results = await Promise.all(
      bitsArray.map(async (bits) => {
        const pKey = paramsStorageKey(this.#chainId, bits);
        const raw = await this.#storage.get<CachedPublicParams>(pKey);
        return raw ? { bits, key: pKey, data: raw } : null;
      }),
    );
    return results.filter(
      (e): e is { bits: number; key: string; data: CachedPublicParams } => e !== null,
    );
  }

  async #clearAll(pkKey: string, paramEntries: Array<{ key: string }>): Promise<void> {
    this.#publicKeyMem = undefined;
    this.#publicParamsMem.clear();
    try {
      await Promise.all([
        this.#storage.delete(pkKey),
        ...paramEntries.map((entry) => this.#storage.delete(entry.key)),
      ]);
    } catch (err) {
      this.#logger?.warn("Failed to clear stale artifacts from persistent storage", {
        chainId: this.#chainId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async #updateValidationTimestamps(
    pkKey: string,
    storedPk: CachedPublicKey,
    paramEntries: Array<{ key: string; data: CachedPublicParams }>,
    now: number,
  ): Promise<void> {
    storedPk.lastValidatedAt = now;
    for (const entry of paramEntries) {
      entry.data.lastValidatedAt = now;
    }

    const writes = [
      this.#storage.set(pkKey, storedPk).catch((err) => {
        this.#logger?.warn("Failed to update public key validation timestamp", {
          chainId: this.#chainId,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
      ...paramEntries.map((entry) =>
        this.#storage.set(entry.key, entry.data).catch((err) => {
          this.#logger?.warn("Failed to update params validation timestamp", {
            chainId: this.#chainId,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    ];
    await Promise.all(writes);
  }
}
