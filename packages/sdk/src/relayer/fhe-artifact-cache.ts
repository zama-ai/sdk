import { z } from "zod/mini";
import type { LoggerService } from "../services/logger-service";
import type { GenericStorage } from "../types";
import { assertNonNullable, toError } from "../utils";
import type { FheEncryptionKey, PublicParamsData } from "./relayer-sdk.types";

// ── Cached data shapes ──────────────────────────────────────

const CachedArtifactBase = z.object({
  artifactUrl: z.optional(z.string()),
  etag: z.optional(z.string()),
  lastModified: z.optional(z.string()),
  // Optional + default(0) preserves the prior `?? 0` fallback for entries
  // persisted before this field was added; 0 marks them stale via the TTL check.
  // oxlint-disable-next-line no-underscore-dangle -- z._default is the Zod v4 mini API
  lastValidatedAt: z._default(z.optional(z.number().check(z.nonnegative())), 0),
});

/** Cached shape for the FHE network public key. */
const CachedPublicKeySchema = z.extend(CachedArtifactBase, {
  publicKeyId: z.string(),
  publicKey: z.string(),
});
type CachedPublicKey = z.infer<typeof CachedPublicKeySchema>;

/** Cached shape for FHE public params. */
const CachedPublicParamsSchema = z.extend(CachedArtifactBase, {
  publicParamsId: z.string(),
  publicParams: z.string(),
});
type CachedPublicParams = z.infer<typeof CachedPublicParamsSchema>;

const ParamsIndexSchema = z.array(z.int().check(z.nonnegative()));

/**
 * Manifest shape returned by the relayer `/keyurl` endpoint. Only the fields
 * actually consumed (status + first URL of each artifact) are validated; the
 * upstream payload contains additional metadata we ignore.
 */
const ManifestSchema = z.object({
  status: z.literal("succeeded"),
  response: z.object({
    fheKeyInfo: z
      .array(
        z.object({
          fhePublicKey: z.object({
            urls: z.array(z.string()).check(z.minLength(1)),
          }),
        }),
      )
      .check(z.minLength(1)),
    crs: z.record(
      z.string(),
      z.object({
        urls: z.array(z.string()).check(z.minLength(1)),
      }),
    ),
  }),
});

// ── Return types ────────────────────────────────────────────

/** Return type of the FHE encryption key fetcher. */
type FheEncryptionKeyResult = FheEncryptionKey | null;

/** Return type of the public params fetcher. */
type PublicParamsResult = PublicParamsData | null;

// ── Constants ───────────────────────────────────────────────

/** Max chunk size for String.fromCharCode to avoid call-stack overflow on large buffers. */
const CHUNK_SIZE = 8192;

/** On revalidation failure, retry after 5 minutes instead of the full TTL. */
const SHORT_RETRY_MS = 5 * 60 * 1000;

// ── Helpers ─────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(b64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new Error(`Invalid base64 data (length: ${b64.length})`);
  }
  if (binary.length === 0) {
    throw new Error("Decoded artifact is empty");
  }
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

type LogContext = Record<string, unknown>;

// ── ArtifactCache ──────────────────────────────────────────

/**
 * Persistent cache for FHE network public key and public params.
 * Uses a {@link GenericStorage} backend (e.g. MemoryStorage, or any
 * user-provided async key-value adapter) to avoid re-downloading large
 * binary data on every app instantiation.
 *
 * Cache keys are scoped by chain ID.
 */
export class FheArtifactCache {
  readonly #storage: GenericStorage;
  readonly #chainId: number;
  readonly #relayerUrl: string;
  readonly #ttlMs: number;
  readonly #logger: LoggerService;
  #publicKeyMem: FheEncryptionKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<FheEncryptionKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();
  #revalidationInflight: Promise<boolean> | null = null;
  /** In-memory guard to skip storage reads when revalidation isn't due. */
  #lastRevalidatedAt: number | null = null;

  constructor(opts: {
    storage: GenericStorage;
    chainId: number;
    relayerUrl: string;
    /** Cache TTL in seconds. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. */
    ttl?: number;
    logger: LoggerService;
  }) {
    this.#storage = opts.storage;
    this.#chainId = opts.chainId;
    this.#relayerUrl = opts.relayerUrl;
    this.#ttlMs = (opts.ttl ?? 86_400) * 1000;
    this.#logger = opts.logger;
  }

  // ── fetchFheEncryptionKeyBytes ──────────────────────────

  async fetchFheEncryptionKeyBytes(
    fetcher: () => Promise<FheEncryptionKeyResult>,
  ): Promise<FheEncryptionKeyResult> {
    if (this.#publicKeyMem !== undefined) {
      return this.#publicKeyMem;
    }

    // Deduplicate concurrent calls
    if (this.#publicKeyInflight) {
      return this.#publicKeyInflight;
    }

    this.#publicKeyInflight = this.#loadFheEncryptionKey(fetcher);
    try {
      return await this.#publicKeyInflight;
    } finally {
      this.#publicKeyInflight = null;
    }
  }

  async #loadFheEncryptionKey(
    fetcher: () => Promise<FheEncryptionKeyResult>,
  ): Promise<FheEncryptionKeyResult> {
    const key = pubkeyStorageKey(this.#chainId);

    const stored = await this.#readCachedEntry(
      key,
      CachedPublicKeySchema,
      "public key",
      "Failed to read public key from persistent storage, falling back to network fetch",
    );
    if (stored) {
      try {
        const result: FheEncryptionKeyResult = {
          publicKeyId: stored.publicKeyId,
          publicKey: fromBase64(stored.publicKey),
        };
        this.#publicKeyMem = result;
        return result;
      } catch (err) {
        await this.#deleteCorruptEntry(key, "public key", { error: toError(err).message });
      }
    }

    const result = await fetcher();
    if (result === null) {
      return null;
    }

    this.#publicKeyMem = result;

    try {
      const entry: CachedPublicKey = {
        publicKeyId: result.publicKeyId,
        publicKey: toBase64(result.publicKey),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, entry);
    } catch (err) {
      this.#logger.warn("Failed to persist public key to storage", {
        chainId: this.#chainId,
        error: toError(err).message,
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
    if (mem !== undefined) {
      return mem;
    }

    // Deduplicate concurrent calls
    const inflight = this.#publicParamsInflight.get(bits);
    if (inflight) {
      return inflight;
    }

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

    const stored = await this.#readCachedEntry(
      key,
      CachedPublicParamsSchema,
      "params",
      "Failed to read public params from persistent storage, falling back to network fetch",
      { bits },
    );
    if (stored) {
      try {
        const result: PublicParamsResult = {
          publicParamsId: stored.publicParamsId,
          publicParams: fromBase64(stored.publicParams),
        };
        this.#publicParamsMem.set(bits, result);
        return result;
      } catch (err) {
        await this.#deleteCorruptEntry(key, "params", { bits, error: toError(err).message });
      }
    }

    const result = await fetcher();
    if (result === null) {
      return null;
    }

    this.#publicParamsMem.set(bits, result);

    try {
      const entry: CachedPublicParams = {
        publicParamsId: result.publicParamsId,
        publicParams: toBase64(result.publicParams),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, entry);

      // Update params index for cold-start CRS detection
      const idxKey = paramsIndexKey(this.#chainId);
      const existing = await this.#readParamsIndex("Failed to read params index from storage");
      if (!existing.includes(bits)) {
        await this.#storage.set(idxKey, [...existing, bits]);
      }
    } catch (err) {
      this.#logger.warn("Failed to persist public params to storage", {
        chainId: this.#chainId,
        bits,
        error: toError(err).message,
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
    if (this.#revalidationInflight) {
      return this.#revalidationInflight;
    }
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
    if (this.#lastRevalidatedAt !== null && now - this.#lastRevalidatedAt < this.#ttlMs) {
      return false;
    }

    // Skip revalidation when relayerUrl is not configured (e.g. Hardhat)
    if (!this.#relayerUrl) {
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
        this.#storage.get(pkKey),
        this.#collectParamEntries(),
      ]);

      // Validate PK shape
      if (pkRaw !== null && pkRaw !== undefined) {
        storedPk = await this.#parseCachedEntry(pkKey, pkRaw, CachedPublicKeySchema, "public key");
      }

      paramEntries = entries;

      if (!storedPk) {
        return false;
      }

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
        // Treat as transient failure — use short retry instead of full TTL
        const retryTimestamp = now - this.#ttlMs + SHORT_RETRY_MS;
        this.#logger.warn("Manifest fetch failed during revalidation, retrying in 5 min", {
          status: manifestRes.status,
          relayerUrl: this.#relayerUrl,
        });
        await this.#writeEntries(
          pkKey,
          { ...storedPk, lastValidatedAt: retryTimestamp },
          paramEntries.map((e) => ({
            ...e,
            data: { ...e.data, lastValidatedAt: retryTimestamp },
          })),
        );
        this.#lastRevalidatedAt = retryTimestamp;
        return false;
      }

      // Validate manifest shape — a malformed response indicates a permanent
      // config error (wrong relayer URL, API version mismatch), not a transient
      // network issue. Log at error level so it's actionable.
      const manifestParsed = ManifestSchema.safeParse(await manifestRes.json());
      if (!manifestParsed.success) {
        this.#logger.error(
          "Relayer manifest has unexpected shape — check relayer URL and API version",
          {
            relayerUrl: this.#relayerUrl,
            error: z.prettifyError(manifestParsed.error),
          },
        );
        // Fail-open with short retry — but the error-level log distinguishes this from transient failures
        const retryTimestamp = now - this.#ttlMs + SHORT_RETRY_MS;
        await this.#writeEntries(
          pkKey,
          { ...storedPk, lastValidatedAt: retryTimestamp },
          paramEntries.map((e) => ({
            ...e,
            data: { ...e.data, lastValidatedAt: retryTimestamp },
          })),
        );
        this.#lastRevalidatedAt = retryTimestamp;
        return false;
      }
      const validManifest = manifestParsed.data.response;
      const fheKeyEntry = validManifest.fheKeyInfo[0];
      assertNonNullable(fheKeyEntry, "manifest.response.fheKeyInfo[0]");

      // ── 4. Check PK artifact ──────────────────────────
      const pkArtifactUrl = fheKeyEntry.fhePublicKey.urls[0];
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
        const manifestCrs = validManifest.crs[String(entry.bits)];
        const crsUrl = manifestCrs?.urls[0];

        // URL change → stale
        if (entry.data.artifactUrl && crsUrl && crsUrl !== entry.data.artifactUrl) {
          await this.#clearAll(pkKey, paramEntries);
          this.#lastRevalidatedAt = null;
          return true;
        }

        let updatedData: CachedPublicParams = {
          ...entry.data,
          lastValidatedAt: now,
        };
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
      const error = toError(err);
      const isProgrammingError =
        err instanceof TypeError ||
        err instanceof ReferenceError ||
        err instanceof RangeError ||
        err instanceof SyntaxError;
      const level = isProgrammingError ? "error" : "warn";
      this.#logger[level](
        isProgrammingError
          ? "Unexpected error during revalidation (possible bug)"
          : "Revalidation failed, using cached artifacts (fail-open)",
        {
          chainId: this.#chainId,
          relayerUrl: this.#relayerUrl,
          error: error.message,
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
        this.#logger.warn("Failed to update validation timestamps after revalidation error", {
          chainId: this.#chainId,
          error: toError(innerErr).message,
        });
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
    if (cached.etag) {
      headers["If-None-Match"] = cached.etag;
    }
    if (cached.lastModified) {
      headers["If-Modified-Since"] = cached.lastModified;
    }

    // HEAD avoids downloading the (potentially multi-MB) artifact body.
    // With conditional headers, the server returns 304 if unchanged or 200 (no body) if stale.
    let res = await globalThis.fetch(url, { method: "HEAD", headers });

    // Fallback to GET if HEAD is not supported (e.g. some CDN/WAF configs)
    if (res.status === 405) {
      res = await globalThis.fetch(url, { headers });
    }

    // Treat server errors as transient — throw so the outer catch applies fail-open with short retry.
    // Without this, a CDN 5xx would be misinterpreted as "artifact changed" and wipe the cache.
    if (!res.ok && res.status !== 304) {
      throw new Error(`Artifact freshness check failed: HEAD ${url} returned ${res.status}`);
    }

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
  }

  // ── Internal helpers ────────────────────────────────────

  async #collectParamEntries(): Promise<
    Array<{ bits: number; key: string; data: CachedPublicParams }>
  > {
    // Merge in-memory keys with persisted index for cold-start CRS detection
    const persistedBits = await this.#readParamsIndex(
      "Failed to read params index, CRS revalidation may be incomplete",
    );
    const allBits = new Set([...this.#publicParamsMem.keys(), ...persistedBits]);

    const bitsArray = Array.from(allBits);
    const results = await Promise.all(
      bitsArray.map(async (bits) => {
        const pKey = paramsStorageKey(this.#chainId, bits);
        // Separate storage read from validation so we only delete on corruption
        let raw: unknown;
        try {
          raw = await this.#storage.get(pKey);
        } catch (err) {
          this.#logger.warn("Failed to read cached params entry during revalidation", {
            chainId: this.#chainId,
            bits,
            error: toError(err).message,
          });
          return null;
        }
        if (raw === null || raw === undefined) {
          return null;
        }
        const data = await this.#parseCachedEntry(pKey, raw, CachedPublicParamsSchema, "params", {
          bits,
        });
        if (!data) {
          return null;
        }
        return { bits, key: pKey, data };
      }),
    );
    return results.filter(
      (e): e is { bits: number; key: string; data: CachedPublicParams } => e !== null,
    );
  }

  async #readCachedEntry<T>(
    key: string,
    schema: z.core.$ZodType<T>,
    label: string,
    readError: string,
    context: LogContext = {},
  ): Promise<T | null> {
    let raw: unknown;
    try {
      raw = await this.#storage.get(key);
    } catch (err) {
      this.#logger.warn(readError, {
        chainId: this.#chainId,
        ...context,
        error: toError(err).message,
      });
      return null;
    }
    if (raw === null || raw === undefined) {
      return null;
    }
    return this.#parseCachedEntry(key, raw, schema, label, context);
  }

  async #parseCachedEntry<T>(
    key: string,
    raw: unknown,
    schema: z.core.$ZodType<T>,
    label: string,
    context: LogContext = {},
  ): Promise<T | null> {
    const parsed = z.safeParse(schema, raw);
    if (parsed.success) {
      return parsed.data;
    }
    await this.#deleteCorruptEntry(key, label, {
      ...context,
      error: z.prettifyError(parsed.error),
    });
    return null;
  }

  async #readParamsIndex(readError: string): Promise<number[]> {
    const idxKey = paramsIndexKey(this.#chainId);
    const index = await this.#readCachedEntry(idxKey, ParamsIndexSchema, "params index", readError);
    return index ?? [];
  }

  async #deleteCorruptEntry(key: string, label: string, context: LogContext = {}): Promise<void> {
    await this.#deleteQuietly(key);
    this.#logger.warn(`Corrupt ${label} cache entry detected, deleting`, {
      chainId: this.#chainId,
      ...context,
    });
  }

  async #deleteQuietly(key: string): Promise<void> {
    await this.#storage.delete(key).catch((err) => {
      this.#logger.warn("Failed to delete cache entry", {
        chainId: this.#chainId,
        key,
        error: toError(err).message,
      });
    });
  }

  async #clearAll(pkKey: string, paramEntries: Array<{ key: string }>): Promise<void> {
    const idxKey = paramsIndexKey(this.#chainId);
    // Delete from persistent storage first — if this fails, in-memory cache
    // still serves stale data, but the next revalidation cycle will retry.
    try {
      await Promise.all([
        this.#storage.delete(pkKey),
        this.#storage.delete(idxKey),
        ...paramEntries.map((entry) => this.#storage.delete(entry.key)),
      ]);
    } catch (err) {
      this.#logger.warn("Failed to clear stale artifacts from persistent storage", {
        chainId: this.#chainId,
        error: toError(err).message,
      });
    }
    // Clear in-memory after storage to avoid re-loading stale entries on failure
    this.#publicKeyMem = undefined;
    this.#publicParamsMem.clear();
  }

  async #writeEntries(
    pkKey: string,
    pk: CachedPublicKey,
    paramEntries: Array<{ key: string; data: CachedPublicParams }>,
  ): Promise<void> {
    const writes = [
      this.#storage.set(pkKey, pk).catch((err) => {
        this.#logger.warn("Failed to update public key validation timestamp", {
          chainId: this.#chainId,
          error: toError(err).message,
        });
      }),
      ...paramEntries.map((entry) =>
        this.#storage.set(entry.key, entry.data).catch((err) => {
          this.#logger.warn("Failed to update params validation timestamp", {
            chainId: this.#chainId,
            error: toError(err).message,
          });
        }),
      ),
    ];
    await Promise.all(writes);
  }
}
