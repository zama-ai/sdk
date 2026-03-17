import type { GenericStorage } from "../token/token.types";
import type { GenericLogger } from "../worker/worker.types";

// ── Cached data shapes ──────────────────────────────────────

/** Cached shape for the FHE network public key. */
interface CachedPublicKey {
  publicKeyId: string;
  /** Base64-encoded Uint8Array. */
  publicKey: string;
  /** Artifact URL from the manifest. */
  artifactUrl?: string;
  /** HTTP ETag from the artifact response. */
  etag?: string;
  /** HTTP Last-Modified from the artifact response. */
  lastModified?: string;
  /** Epoch-ms timestamp of the last successful revalidation. */
  lastValidatedAt: number;
}

/** Cached shape for FHE public params. */
interface CachedPublicParams {
  publicParamsId: string;
  /** Base64-encoded Uint8Array. */
  publicParams: string;
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt: number;
}

// ── Return types ────────────────────────────────────────────

/** Return type of the public key fetcher. */
type PublicKeyResult = { publicKeyId: string; publicKey: Uint8Array } | null;

/** Return type of the public params fetcher. */
type PublicParamsResult = {
  publicParamsId: string;
  publicParams: Uint8Array;
} | null;

// ── Constants ───────────────────────────────────────────────

/** Max chunk size for String.fromCharCode to avoid call-stack overflow on large buffers. */
const CHUNK_SIZE = 8192;

/** On revalidation failure, retry after 5 minutes instead of the full TTL. */
const SHORT_RETRY_MS = 5 * 60 * 1000;

// ── Helpers ─────────────────────────────────────────────────

const fallbackLogger: Pick<GenericLogger, "warn"> = {
  warn: (...args: unknown[]) => console.warn("[PublicParamsCache]", ...args),
};

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

function paramsIndexKey(chainId: number): string {
  return `fhe:params-index:${chainId}`;
}

function isValidCachedPk(v: unknown): v is CachedPublicKey {
  return (
    v != null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).publicKeyId === "string" &&
    typeof (v as Record<string, unknown>).publicKey === "string"
  );
}

function isValidCachedParams(v: unknown): v is CachedPublicParams {
  return (
    v != null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).publicParamsId === "string" &&
    typeof (v as Record<string, unknown>).publicParams === "string"
  );
}

/** Manifest shape returned by the relayer `/keyurl` endpoint. */
interface ManifestShape {
  fhePublicKey?: { dataId?: string; urls?: string[] };
  crs?: Record<string, { dataId?: string; urls?: string[] }>;
}

// ── PublicParamsCache ───────────────────────────────────────

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
  readonly #ttlMs: number;
  readonly #logger?: GenericLogger;
  #publicKeyMem: PublicKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<PublicKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();
  #revalidationInflight: Promise<boolean> | null = null;
  /** In-memory guard to skip storage reads when revalidation isn't due. */
  #lastRevalidatedAt: number | null = null;

  constructor(opts: {
    storage: GenericStorage;
    chainId: number;
    relayerUrl: string;
    /** Cache TTL in seconds. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. */
    fheArtifactCacheTTL?: number;
    logger?: GenericLogger;
  }) {
    this.#storage = opts.storage;
    this.#chainId = opts.chainId;
    this.#relayerUrl = opts.relayerUrl;
    this.#ttlMs = (opts.fheArtifactCacheTTL ?? 86_400) * 1000;
    this.#logger = opts.logger;
  }

  // ── getPublicKey ────────────────────────────────────────

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
      const raw = await this.#storage.get<unknown>(key);
      if (raw) {
        if (isValidCachedPk(raw)) {
          const result: PublicKeyResult = {
            publicKeyId: raw.publicKeyId,
            publicKey: fromBase64(raw.publicKey),
          };
          this.#publicKeyMem = result;
          return result;
        }
        // Corrupt entry — delete and fall through to fetcher
        await this.#storage.delete(key).catch(() => {});
      }
    } catch (err) {
      (this.#logger ?? fallbackLogger).warn(
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
      (this.#logger ?? fallbackLogger).warn("Failed to persist public key to storage", {
        chainId: this.#chainId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  // ── getPublicParams ─────────────────────────────────────

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
      const raw = await this.#storage.get<unknown>(key);
      if (raw) {
        if (isValidCachedParams(raw)) {
          const result: PublicParamsResult = {
            publicParamsId: raw.publicParamsId,
            publicParams: fromBase64(raw.publicParams),
          };
          this.#publicParamsMem.set(bits, result);
          return result;
        }
        // Corrupt entry — delete and fall through to fetcher
        await this.#storage.delete(key).catch(() => {});
      }
    } catch (err) {
      (this.#logger ?? fallbackLogger).warn(
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

      // Update params index for cold-start CRS detection
      const idxKey = paramsIndexKey(this.#chainId);
      const existing = (await this.#storage.get<number[]>(idxKey).catch(() => null)) ?? [];
      if (!existing.includes(bits)) {
        await this.#storage.set(idxKey, [...existing, bits]);
      }
    } catch (err) {
      (this.#logger ?? fallbackLogger).warn("Failed to persist public params to storage", {
        chainId: this.#chainId,
        bits,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  // ── Artifact-level revalidation ─────────────────────────

  /**
   * Check whether cached FHE artifacts are still fresh by issuing
   * HTTP conditional requests (ETag / If-None-Match, Last-Modified /
   * If-Modified-Since) against the actual artifact CDN URLs.
   *
   * @returns `true` if the cache was invalidated and the caller should
   *   re-fetch artifacts, `false` otherwise.
   */
  async revalidateIfDue(): Promise<boolean> {
    // Concurrency guard — coalesce overlapping calls
    if (this.#revalidationInflight) return this.#revalidationInflight;
    this.#revalidationInflight = this.#revalidateIfDueInner();
    try {
      return await this.#revalidationInflight;
    } finally {
      this.#revalidationInflight = null;
    }
  }

  async #revalidateIfDueInner(): Promise<boolean> {
    // Fast path: in-memory timestamp check avoids storage I/O on every call
    const now = Date.now();
    if (this.#lastRevalidatedAt != null && now - this.#lastRevalidatedAt < this.#ttlMs) {
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
      const [pkRaw, entries] = await Promise.all([
        this.#storage.get<unknown>(pkKey),
        this.#collectParamEntries(),
      ]);

      // Validate PK shape
      if (pkRaw && isValidCachedPk(pkRaw)) {
        storedPk = { ...pkRaw, lastValidatedAt: pkRaw.lastValidatedAt ?? 0 };
      } else if (pkRaw) {
        // Corrupt — delete
        await this.#storage.delete(pkKey).catch(() => {});
      }

      paramEntries = entries;

      if (!storedPk) return false;

      // 2. Check if all entries are within TTL
      const allEntries: Array<{ lastValidatedAt: number }> = [
        storedPk,
        ...paramEntries.map((e) => e.data),
      ];
      const allFresh = allEntries.every((e) => now - e.lastValidatedAt < this.#ttlMs);
      if (allFresh) {
        this.#lastRevalidatedAt = now;
        return false;
      }

      // 3. Fetch manifest to discover current artifact URLs
      const manifestRes = await globalThis.fetch(`${this.#relayerUrl}/keyurl`);
      if (!manifestRes.ok) {
        (this.#logger ?? fallbackLogger).warn(
          "Manifest fetch failed during revalidation, treating cache as fresh",
          { status: manifestRes.status, relayerUrl: this.#relayerUrl },
        );
        await this.#writeEntries(
          pkKey,
          { ...storedPk, lastValidatedAt: now },
          paramEntries.map((e) => ({ ...e, data: { ...e.data, lastValidatedAt: now } })),
        );
        this.#lastRevalidatedAt = now;
        return false;
      }

      const manifest = (await manifestRes.json()) as ManifestShape;

      // ── 4. Check PK artifact ──────────────────────────
      const pkArtifactUrl = manifest.fhePublicKey?.urls?.[0];

      // URL change → stale
      if (storedPk.artifactUrl && pkArtifactUrl && pkArtifactUrl !== storedPk.artifactUrl) {
        await this.#clearAll(pkKey, paramEntries);
        this.#lastRevalidatedAt = null;
        return true;
      }

      let updatedPk: CachedPublicKey = { ...storedPk, lastValidatedAt: now };
      if (pkArtifactUrl) {
        const freshness = await this.#checkArtifactFreshness(pkArtifactUrl, storedPk);
        if (!freshness.fresh) {
          await this.#clearAll(pkKey, paramEntries);
          this.#lastRevalidatedAt = null;
          return true;
        }
        updatedPk = {
          ...updatedPk,
          artifactUrl: pkArtifactUrl,
          etag: freshness.etag,
          lastModified: freshness.lastModified,
        };
      }

      // ── 5. Check each CRS artifact ────────────────────
      const updatedParamEntries: typeof paramEntries = [];
      for (const entry of paramEntries) {
        const manifestCrs = manifest.crs?.[String(entry.bits)];
        const crsUrl = manifestCrs?.urls?.[0];

        // URL change → stale
        if (entry.data.artifactUrl && crsUrl && crsUrl !== entry.data.artifactUrl) {
          await this.#clearAll(pkKey, paramEntries);
          this.#lastRevalidatedAt = null;
          return true;
        }

        let updatedData: CachedPublicParams = { ...entry.data, lastValidatedAt: now };
        if (crsUrl) {
          const freshness = await this.#checkArtifactFreshness(crsUrl, entry.data);
          if (!freshness.fresh) {
            await this.#clearAll(pkKey, paramEntries);
            this.#lastRevalidatedAt = null;
            return true;
          }
          updatedData = {
            ...updatedData,
            artifactUrl: crsUrl,
            etag: freshness.etag,
            lastModified: freshness.lastModified,
          };
        }
        updatedParamEntries.push({ ...entry, data: updatedData });
      }

      // 6. All fresh — update timestamps and HTTP validators
      await this.#writeEntries(pkKey, updatedPk, updatedParamEntries);
      this.#lastRevalidatedAt = now;
      return false;
    } catch (err) {
      (this.#logger ?? fallbackLogger).warn(
        "Revalidation failed, using cached artifacts (fail-open)",
        {
          chainId: this.#chainId,
          relayerUrl: this.#relayerUrl,
          error: err instanceof Error ? err.message : String(err),
        },
      );

      // Fail-open: use short retry interval (5 min) instead of full TTL
      const retryTimestamp = now - this.#ttlMs + SHORT_RETRY_MS;
      try {
        if (storedPk) {
          await this.#writeEntries(
            pkKey,
            { ...storedPk, lastValidatedAt: retryTimestamp },
            paramEntries.map((e) => ({
              ...e,
              data: { ...e.data, lastValidatedAt: retryTimestamp },
            })),
          );
        }
      } catch (innerErr) {
        (this.#logger ?? fallbackLogger).warn(
          "Failed to update validation timestamps after revalidation error",
          {
            chainId: this.#chainId,
            error: innerErr instanceof Error ? innerErr.message : String(innerErr),
          },
        );
      }
      this.#lastRevalidatedAt = retryTimestamp;
      return false;
    }
  }

  // ── Artifact freshness via HTTP conditional requests ───

  async #checkArtifactFreshness(
    url: string,
    cached: { etag?: string; lastModified?: string },
  ): Promise<{ fresh: boolean; etag?: string; lastModified?: string }> {
    const hasValidators = Boolean(cached.etag || cached.lastModified);
    const headers: Record<string, string> = {};
    if (cached.etag) headers["If-None-Match"] = cached.etag;
    if (cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    // HEAD when no validators (first check — just capture them).
    // Conditional GET when we have validators (server returns 304 if unchanged).
    const method = hasValidators ? "GET" : "HEAD";
    const controller = new AbortController();

    try {
      const res = await globalThis.fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });

      const etag = res.headers.get("etag") ?? undefined;
      const lastModified = res.headers.get("last-modified") ?? undefined;

      if (res.status === 304) {
        return {
          fresh: true,
          etag: etag ?? cached.etag,
          lastModified: lastModified ?? cached.lastModified,
        };
      }

      if (!hasValidators) {
        // First revalidation — capture validators, treat as fresh
        return { fresh: true, etag, lastModified };
      }

      // 200 = artifact changed
      return { fresh: false, etag, lastModified };
    } finally {
      // Abort to avoid downloading large response bodies on 200
      controller.abort();
    }
  }

  // ── Internal helpers ────────────────────────────────────

  async #collectParamEntries(): Promise<
    Array<{ bits: number; key: string; data: CachedPublicParams }>
  > {
    // Merge in-memory keys with persisted index for cold-start CRS detection
    const idxKey = paramsIndexKey(this.#chainId);
    const persistedBits = (await this.#storage.get<number[]>(idxKey).catch(() => null)) ?? [];
    const allBits = new Set([...this.#publicParamsMem.keys(), ...persistedBits]);

    const bitsArray = Array.from(allBits);
    const results = await Promise.all(
      bitsArray.map(async (bits) => {
        const pKey = paramsStorageKey(this.#chainId, bits);
        const raw = await this.#storage.get<unknown>(pKey);
        if (raw && isValidCachedParams(raw)) {
          return {
            bits,
            key: pKey,
            data: { ...raw, lastValidatedAt: raw.lastValidatedAt ?? 0 } as CachedPublicParams,
          };
        }
        if (raw) {
          // Corrupt entry — delete
          await this.#storage.delete(pKey).catch(() => {});
        }
        return null;
      }),
    );
    return results.filter(
      (e): e is { bits: number; key: string; data: CachedPublicParams } => e !== null,
    );
  }

  async #clearAll(pkKey: string, paramEntries: Array<{ key: string }>): Promise<void> {
    this.#publicKeyMem = undefined;
    this.#publicParamsMem.clear();
    const idxKey = paramsIndexKey(this.#chainId);
    try {
      await Promise.all([
        this.#storage.delete(pkKey),
        this.#storage.delete(idxKey),
        ...paramEntries.map((entry) => this.#storage.delete(entry.key)),
      ]);
    } catch (err) {
      (this.#logger ?? fallbackLogger).warn(
        "Failed to clear stale artifacts from persistent storage",
        {
          chainId: this.#chainId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }

  async #writeEntries(
    pkKey: string,
    pk: CachedPublicKey,
    paramEntries: Array<{ key: string; data: CachedPublicParams }>,
  ): Promise<void> {
    const writes = [
      this.#storage.set(pkKey, pk).catch((err) => {
        (this.#logger ?? fallbackLogger).warn("Failed to update public key validation timestamp", {
          chainId: this.#chainId,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
      ...paramEntries.map((entry) =>
        this.#storage.set(entry.key, entry.data).catch((err) => {
          (this.#logger ?? fallbackLogger).warn("Failed to update params validation timestamp", {
            chainId: this.#chainId,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    ];
    await Promise.all(writes);
  }
}
