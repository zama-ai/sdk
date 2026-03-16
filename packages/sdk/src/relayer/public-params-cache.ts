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
type PublicParamsResult = { publicParamsId: string; publicParams: Uint8Array } | null;

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
  readonly #logger?: GenericLogger;
  #publicKeyMem: PublicKeyResult | undefined;
  #publicParamsMem = new Map<number, PublicParamsResult>();
  #publicKeyInflight: Promise<PublicKeyResult> | null = null;
  #publicParamsInflight = new Map<number, Promise<PublicParamsResult>>();

  constructor(opts: { storage: GenericStorage; chainId: number; logger?: GenericLogger }) {
    this.#storage = opts.storage;
    this.#chainId = opts.chainId;
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
  async revalidateIfDue(relayerUrl: string, intervalMs: number): Promise<boolean> {
    const pkKey = pubkeyStorageKey(this.#chainId);

    try {
      // 1. Read PK cache entry
      const storedPk = await this.#storage.get<CachedPublicKey>(pkKey);
      if (!storedPk) return false;

      // 2. Collect params entries (only those known to the in-memory map)
      const paramEntries = await this.#collectParamEntries();

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
        this.#logger?.warn("Manifest fetch failed during revalidation, treating cache as fresh", {
          status: manifestRes.status,
          relayerUrl,
        });
        await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
        return false;
      }
      const manifest = (await manifestRes.json()) as {
        fhePublicKey?: { dataId?: string; urls?: string[] };
        crs?: Record<string, { dataId?: string; urls?: string[] }>;
      };

      // 5. Check public key freshness via dataId
      const manifestPkId = manifest.fhePublicKey?.dataId;
      if (manifestPkId && manifestPkId !== storedPk.publicKeyId) {
        await this.#clearAll(pkKey, paramEntries);
        return true;
      }

      // 6. Check each CRS entry via dataId
      for (const entry of paramEntries) {
        const manifestCrs = manifest.crs?.[String(entry.bits)];
        const manifestCrsId = manifestCrs?.dataId;

        if (manifestCrsId && manifestCrsId !== entry.data.publicParamsId) {
          await this.#clearAll(pkKey, paramEntries);
          return true;
        }
      }

      // 7. All fresh — update timestamps
      await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
      return false;
    } catch (err) {
      this.#logger?.warn("Revalidation failed, using cached artifacts (fail-open)", {
        chainId: this.#chainId,
        relayerUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-open: try to update timestamps to prevent retry storm
      try {
        const storedPk = await this.#storage.get<CachedPublicKey>(pkKey);
        if (storedPk) {
          const paramEntries = await this.#collectParamEntries();
          await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, Date.now());
        }
      } catch (innerErr) {
        this.#logger?.warn("Failed to update validation timestamps after revalidation error", {
          chainId: this.#chainId,
          error: innerErr instanceof Error ? innerErr.message : String(innerErr),
        });
      }
      return false;
    }
  }

  async #collectParamEntries(): Promise<
    Array<{ bits: number; key: string; data: CachedPublicParams }>
  > {
    const entries: Array<{ bits: number; key: string; data: CachedPublicParams }> = [];
    for (const bits of this.#publicParamsMem.keys()) {
      const pKey = paramsStorageKey(this.#chainId, bits);
      const raw = await this.#storage.get<CachedPublicParams>(pKey);
      if (raw) entries.push({ bits, key: pKey, data: raw });
    }
    return entries;
  }

  async #clearAll(pkKey: string, paramEntries: Array<{ key: string }>): Promise<void> {
    this.#publicKeyMem = undefined;
    this.#publicParamsMem.clear();
    try {
      await this.#storage.delete(pkKey);
      for (const entry of paramEntries) {
        await this.#storage.delete(entry.key);
      }
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
    try {
      storedPk.lastValidatedAt = now;
      await this.#storage.set(pkKey, storedPk);
    } catch (err) {
      this.#logger?.warn("Failed to update public key validation timestamp", {
        chainId: this.#chainId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    for (const entry of paramEntries) {
      try {
        entry.data.lastValidatedAt = now;
        await this.#storage.set(entry.key, entry.data);
      } catch (err) {
        this.#logger?.warn("Failed to update params validation timestamp", {
          chainId: this.#chainId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
