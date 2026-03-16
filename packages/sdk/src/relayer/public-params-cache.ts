import type { GenericStorage } from "../token/token.types";

/** Cached shape for the FHE network public key. */
interface CachedPublicKey {
  publicKeyId: string;
  /** Base64-encoded Uint8Array. */
  publicKey: string;
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt?: number;
}

/** Cached shape for FHE public params. */
interface CachedPublicParams {
  publicParamsId: string;
  /** Base64-encoded Uint8Array. */
  publicParams: string;
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt?: number;
}

/** Return type of the public key fetcher. */
type PublicKeyResult = { publicKeyId: string; publicKey: Uint8Array } | null;

/** Return type of the public params fetcher. */
type PublicParamsResult = { publicParamsId: string; publicParams: Uint8Array } | null;

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
 * Uses a {@link GenericStorage} backend (IndexedDB, memory, etc.)
 * to avoid re-downloading large binary data on every app instantiation.
 *
 * Cache keys are scoped by chain ID.
 */
export class PublicParamsCache {
  readonly #storage: GenericStorage;
  readonly #chainId: number;
  #publicKeyMem: PublicKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<PublicKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();

  constructor(storage: GenericStorage, chainId: number) {
    this.#storage = storage;
    this.#chainId = chainId;
  }

  async getPublicKey(fetcher: () => Promise<PublicKeyResult>): Promise<PublicKeyResult> {
    // In-memory hit
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

    // Try persistent storage
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
    } catch {
      // Storage read failed — fall through to fetcher
    }

    // Fetch from relayer
    const result = await fetcher();
    if (result === null) return null;

    // Cache in memory
    this.#publicKeyMem = result;

    // Persist (best-effort)
    try {
      const cached: CachedPublicKey = {
        publicKeyId: result.publicKeyId,
        publicKey: toBase64(result.publicKey),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, cached);
    } catch {
      // Write failed — data still usable in memory
    }

    return result;
  }

  async getPublicParams(
    bits: number,
    fetcher: () => Promise<PublicParamsResult>,
  ): Promise<PublicParamsResult> {
    // In-memory hit
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

    // Try persistent storage
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
    } catch {
      // Storage read failed — fall through to fetcher
    }

    // Fetch from relayer
    const result = await fetcher();
    if (result === null) return null;

    // Cache in memory
    this.#publicParamsMem.set(bits, result);

    // Persist (best-effort)
    try {
      const cached: CachedPublicParams = {
        publicParamsId: result.publicParamsId,
        publicParams: toBase64(result.publicParams),
        lastValidatedAt: Date.now(),
      };
      await this.#storage.set(key, cached);
    } catch {
      // Write failed — data still usable in memory
    }

    return result;
  }

  // ── Artifact-level revalidation ──────────────────────────────

  /**
   * Check whether cached FHE artifacts are still fresh by consulting the
   * relayer manifest and issuing conditional HEAD requests against the
   * artifact URLs.
   *
   * @returns `true` if the cache was invalidated (caller should tear down
   *   the worker), `false` otherwise.
   */
  async revalidateIfDue(relayerUrl: string, intervalMs: number): Promise<boolean> {
    const pkKey = pubkeyStorageKey(this.#chainId);

    try {
      // 1. Read PK cache entry
      const storedPk = await this.#storage.get<CachedPublicKey>(pkKey);
      if (!storedPk) return false;

      // 2. Collect params entries
      const paramEntries: Array<{
        bits: number;
        key: string;
        data: CachedPublicParams;
      }> = [];
      for (const bits of this.#publicParamsMem.keys()) {
        const pKey = paramsStorageKey(this.#chainId, bits);
        const raw = await this.#storage.get<CachedPublicParams>(pKey);
        if (raw) {
          paramEntries.push({ bits, key: pKey, data: raw });
        }
      }

      // 3. Check if all entries are within intervalMs
      const now = Date.now();
      const allEntries: Array<{ lastValidatedAt?: number }> = [
        storedPk,
        ...paramEntries.map((e) => e.data),
      ];
      const allFresh = allEntries.every(
        (e) => e.lastValidatedAt != null && now - e.lastValidatedAt < intervalMs,
      );
      if (allFresh) return false;

      // 4. Fetch manifest
      const manifestRes = await globalThis.fetch(`${relayerUrl}/keyurl`);
      if (!manifestRes.ok) {
        await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
        return false;
      }
      const manifest = (await manifestRes.json()) as {
        fhePublicKey?: { dataId?: string; urls?: string[] };
        crs?: Record<string, { dataId?: string; urls?: string[] }>;
      };

      // 5. Check public key freshness
      const manifestPkUrl = manifest.fhePublicKey?.urls?.[0];
      const manifestPkId = manifest.fhePublicKey?.dataId;

      if (manifestPkUrl && storedPk.artifactUrl && manifestPkUrl !== storedPk.artifactUrl) {
        await this.#clearAll(pkKey, paramEntries);
        return true;
      }

      if (manifestPkId && manifestPkId !== storedPk.publicKeyId) {
        await this.#clearAll(pkKey, paramEntries);
        return true;
      }

      if (storedPk.artifactUrl) {
        const stale = await this.#checkArtifactFreshness(storedPk.artifactUrl, {
          etag: storedPk.etag,
          lastModified: storedPk.lastModified,
        });
        if (stale) {
          await this.#clearAll(pkKey, paramEntries);
          return true;
        }
      }

      // 6. Check each CRS entry
      for (const entry of paramEntries) {
        const manifestCrs = manifest.crs?.[String(entry.bits)];
        const manifestCrsUrl = manifestCrs?.urls?.[0];
        const manifestCrsId = manifestCrs?.dataId;

        if (manifestCrsUrl && entry.data.artifactUrl && manifestCrsUrl !== entry.data.artifactUrl) {
          await this.#clearAll(pkKey, paramEntries);
          return true;
        }

        if (manifestCrsId && manifestCrsId !== entry.data.publicParamsId) {
          await this.#clearAll(pkKey, paramEntries);
          return true;
        }

        if (entry.data.artifactUrl) {
          const stale = await this.#checkArtifactFreshness(entry.data.artifactUrl, {
            etag: entry.data.etag,
            lastModified: entry.data.lastModified,
          });
          if (stale) {
            await this.#clearAll(pkKey, paramEntries);
            return true;
          }
        }
      }

      // 7. All fresh — update timestamps
      await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
      return false;
    } catch {
      // Fail-open: try to update timestamps to prevent retry storm
      try {
        const storedPk = await this.#storage.get<CachedPublicKey>(pkKey);
        if (storedPk) {
          const paramEntries: Array<{
            bits: number;
            key: string;
            data: CachedPublicParams;
          }> = [];
          for (const bits of this.#publicParamsMem.keys()) {
            const pKey = paramsStorageKey(this.#chainId, bits);
            const raw = await this.#storage.get<CachedPublicParams>(pKey);
            if (raw) {
              paramEntries.push({ bits, key: pKey, data: raw });
            }
          }
          await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, Date.now());
        }
      } catch {
        // Best-effort — ignore
      }
      return false;
    }
  }

  /**
   * Issue a conditional HEAD request against an artifact URL.
   * @returns `true` if the artifact is STALE (needs re-fetch).
   */
  async #checkArtifactFreshness(
    artifactUrl: string,
    cached: { etag?: string; lastModified?: string },
  ): Promise<boolean> {
    const headers: Record<string, string> = {};
    if (cached.etag) headers["If-None-Match"] = cached.etag;
    if (cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    const res = await globalThis.fetch(artifactUrl, {
      method: "HEAD",
      headers,
    });

    if (res.status === 304) return false; // still fresh

    // Compare validators from the response
    const newEtag = res.headers.get("etag");
    const newLastModified = res.headers.get("last-modified");

    if (cached.etag && newEtag && cached.etag !== newEtag) return true;
    if (cached.lastModified && newLastModified && cached.lastModified !== newLastModified)
      return true;

    return false;
  }

  async #clearAll(pkKey: string, paramEntries: Array<{ key: string }>): Promise<void> {
    this.#publicKeyMem = undefined;
    this.#publicParamsMem.clear();
    await this.#storage.delete(pkKey);
    for (const entry of paramEntries) {
      await this.#storage.delete(entry.key);
    }
  }

  async #updateValidationTimestamps(
    pkKey: string,
    storedPk: CachedPublicKey,
    paramEntries: Array<{ key: string; data: CachedPublicParams }>,
    now: number,
  ): Promise<void> {
    storedPk.lastValidatedAt = now;
    await this.#storage.set(pkKey, storedPk);

    for (const entry of paramEntries) {
      entry.data.lastValidatedAt = now;
      await this.#storage.set(entry.key, entry.data);
    }
  }
}
