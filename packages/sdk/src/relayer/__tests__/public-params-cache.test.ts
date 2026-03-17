import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStorage } from "../../token/memory-storage";
import { PublicParamsCache } from "../public-params-cache";

const DUMMY_RELAYER_URL = "https://relayer.example.com";

describe("PublicParamsCache", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  // ── getPublicKey ──────────────────────────────────────────────

  describe("getPublicKey", () => {
    it("returns cached public key without calling fetcher on cache hit", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1, 2, 3]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      // First call — fetches and stores
      const result1 = await cache.getPublicKey(fetcher);
      expect(result1).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce();

      // Second call — returns from cache, no fetch
      const result2 = await cache.getPublicKey(fetcher);
      expect(result2).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce(); // Still once
    });

    it("persists public key to storage and restores from a fresh cache instance", async () => {
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([10, 20]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      // Store via first cache instance
      const cache1 = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      await cache1.getPublicKey(fetcher);
      expect(fetcher).toHaveBeenCalledOnce();

      // New cache instance, same storage — should restore without fetching
      const cache2 = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const fetcher2 = vi.fn().mockResolvedValue(null);
      const result = await cache2.getPublicKey(fetcher2);

      expect(result).toEqual(pk);
      expect(fetcher2).not.toHaveBeenCalled();
    });

    it("uses different cache keys per chain ID", async () => {
      const pk1 = { publicKeyId: "sepolia", publicKey: new Uint8Array([1]) };
      const pk2 = { publicKeyId: "mainnet", publicKey: new Uint8Array([2]) };

      const cache1 = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      await cache1.getPublicKey(vi.fn().mockResolvedValue(pk1));

      const cache2 = new PublicParamsCache({ storage, chainId: 1, relayerUrl: DUMMY_RELAYER_URL });
      const fetcher2 = vi.fn().mockResolvedValue(pk2);
      const result = await cache2.getPublicKey(fetcher2);

      // Different chain → must fetch again
      expect(fetcher2).toHaveBeenCalledOnce();
      expect(result).toEqual(pk2);
    });

    it("returns null and does not cache when fetcher returns null", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const fetcher = vi.fn().mockResolvedValue(null);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toBeNull();

      // Next call should try again since null wasn't cached
      const fetcher2 = vi.fn().mockResolvedValue(null);
      await cache.getPublicKey(fetcher2);
      expect(fetcher2).toHaveBeenCalledOnce();
    });

    it("falls back to fetcher when storage read fails", async () => {
      const badStorage = {
        get: vi.fn().mockRejectedValue(new Error("read failed")),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const cache = new PublicParamsCache({
        storage: badStorage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("still returns data when storage write fails", async () => {
      const badStorage = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockRejectedValue(new Error("write failed")),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const cache = new PublicParamsCache({
        storage: badStorage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toEqual(pk);
    });

    it("logs warning when storage read fails", async () => {
      const badStorage = {
        get: vi.fn().mockRejectedValue(new Error("read failed")),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

      const cache = new PublicParamsCache({
        storage: badStorage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
        logger,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      await cache.getPublicKey(vi.fn().mockResolvedValue(pk));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read public key"),
        expect.objectContaining({ error: "read failed" }),
      );
    });

    it("propagates fetcher errors to caller", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

      await expect(cache.getPublicKey(fetcher)).rejects.toThrow("network down");
    });

    it("deletes corrupt cache entry and falls back to fetcher", async () => {
      // Seed storage with an entry missing `publicKeyId` (corrupt shape)
      await storage.set("fhe:pubkey:11155111", { publicKey: "not-an-id" });

      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1]) };
      const result = await cache.getPublicKey(vi.fn().mockResolvedValue(pk));

      expect(result).toEqual(pk);
      // Corrupt entry should have been deleted
      const raw = await storage.get("fhe:pubkey:11155111");
      // Now contains the freshly-stored valid entry
      expect(raw).not.toBeNull();
      expect((raw as Record<string, unknown>).publicKeyId).toBe("id1");
    });
  });

  // ── getPublicParams ───────────────────────────────────────────

  describe("getPublicParams", () => {
    it("returns cached public params without calling fetcher on cache hit", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pp = { publicParamsId: "pp1", publicParams: new Uint8Array([4, 5, 6]) };
      const fetcher = vi.fn().mockResolvedValue(pp);

      const result1 = await cache.getPublicParams(2048, fetcher);
      expect(result1).toEqual(pp);
      expect(fetcher).toHaveBeenCalledOnce();

      const result2 = await cache.getPublicParams(2048, fetcher);
      expect(result2).toEqual(pp);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("persists public params to storage and restores from a fresh cache instance", async () => {
      const pp = { publicParamsId: "pp1", publicParams: new Uint8Array([7, 8]) };
      const fetcher = vi.fn().mockResolvedValue(pp);

      const cache1 = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      await cache1.getPublicParams(2048, fetcher);

      const cache2 = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const fetcher2 = vi.fn().mockResolvedValue(null);
      const result = await cache2.getPublicParams(2048, fetcher2);

      expect(result).toEqual(pp);
      expect(fetcher2).not.toHaveBeenCalled();
    });

    it("uses different cache keys per bit size", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pp2048 = { publicParamsId: "pp-2048", publicParams: new Uint8Array([1]) };
      const pp4096 = { publicParamsId: "pp-4096", publicParams: new Uint8Array([2]) };

      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(pp2048));
      const fetcher4096 = vi.fn().mockResolvedValue(pp4096);
      const result = await cache.getPublicParams(4096, fetcher4096);

      expect(fetcher4096).toHaveBeenCalledOnce();
      expect(result).toEqual(pp4096);
    });

    it("returns null and does not cache when fetcher returns null", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const fetcher = vi.fn().mockResolvedValue(null);

      const result = await cache.getPublicParams(2048, fetcher);
      expect(result).toBeNull();

      const fetcher2 = vi.fn().mockResolvedValue(null);
      await cache.getPublicParams(2048, fetcher2);
      expect(fetcher2).toHaveBeenCalledOnce();
    });

    it("updates params index for cold-start CRS detection", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pp = { publicParamsId: "pp1", publicParams: new Uint8Array([1]) };
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(pp));

      const idx = await storage.get<number[]>("fhe:params-index:11155111");
      expect(idx).toEqual([2048]);

      // Adding another bit size appends to the index
      const pp2 = { publicParamsId: "pp2", publicParams: new Uint8Array([2]) };
      await cache.getPublicParams(4096, vi.fn().mockResolvedValue(pp2));

      const idx2 = await storage.get<number[]>("fhe:params-index:11155111");
      expect(idx2).toEqual([2048, 4096]);
    });
  });

  // ── revalidateIfDue ─────────────────────────────────────────

  describe("revalidateIfDue", () => {
    const CHAIN_ID = 11155111;
    const RELAYER_URL = DUMMY_RELAYER_URL;
    const CACHE_TTL = 60; // seconds
    const CACHE_TTL_MS = CACHE_TTL * 1000;
    const PK_STORAGE_KEY = `fhe:pubkey:${CHAIN_ID}`;
    const PARAMS_STORAGE_KEY = `fhe:params:${CHAIN_ID}:2048`;
    const PARAMS_INDEX_KEY = `fhe:params-index:${CHAIN_ID}`;

    const PK_ARTIFACT_URL = "https://cdn.example.com/pk.bin";
    const CRS_ARTIFACT_URL = "https://cdn.example.com/params-2048.bin";

    let originalFetch: typeof globalThis.fetch;

    function makeCachedPk(
      overrides: Partial<{
        publicKeyId: string;
        publicKey: string;
        artifactUrl: string;
        etag: string;
        lastModified: string;
        lastValidatedAt: number;
      }> = {},
    ) {
      return {
        publicKeyId: "pk-id-1",
        publicKey: btoa(String.fromCharCode(1, 2, 3)),
        artifactUrl: PK_ARTIFACT_URL,
        etag: '"pk-etag-1"',
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        lastValidatedAt: Date.now(),
        ...overrides,
      };
    }

    function makeCachedParams(
      overrides: Partial<{
        publicParamsId: string;
        publicParams: string;
        artifactUrl: string;
        etag: string;
        lastModified: string;
        lastValidatedAt: number;
      }> = {},
    ) {
      return {
        publicParamsId: "pp-id-1",
        publicParams: btoa(String.fromCharCode(4, 5, 6)),
        artifactUrl: CRS_ARTIFACT_URL,
        etag: '"pp-etag-1"',
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        lastValidatedAt: Date.now(),
        ...overrides,
      };
    }

    const MANIFEST = {
      fhePublicKey: {
        dataId: "pk-id-1",
        urls: [PK_ARTIFACT_URL],
      },
      crs: {
        2048: {
          dataId: "pp-id-1",
          urls: [CRS_ARTIFACT_URL],
        },
      },
    };

    /** Build a mock fetch that handles manifest + artifact conditional requests. */
    function mockFetch(
      opts: {
        manifest?: typeof MANIFEST;
        manifestOk?: boolean;
        manifestStatus?: number;
        pkStatus?: number;
        pkHeaders?: Record<string, string>;
        crsStatus?: number;
        crsHeaders?: Record<string, string>;
      } = {},
    ) {
      const {
        manifest = MANIFEST,
        manifestOk = true,
        manifestStatus = 200,
        pkStatus = 304,
        pkHeaders = { etag: '"pk-etag-1"' },
        crsStatus = 304,
        crsHeaders = { etag: '"pp-etag-1"' },
      } = opts;

      globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = String(url);
        if (urlStr === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: manifestOk,
            status: manifestStatus,
            json: () => Promise.resolve(manifest),
          });
        }
        if (urlStr === PK_ARTIFACT_URL) {
          return Promise.resolve({
            status: pkStatus,
            ok: pkStatus >= 200 && pkStatus < 300,
            headers: new Headers(pkHeaders),
            body: null,
          });
        }
        if (urlStr === CRS_ARTIFACT_URL) {
          return Promise.resolve({
            status: crsStatus,
            ok: crsStatus >= 200 && crsStatus < 300,
            headers: new Headers(crsHeaders),
            body: null,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });
    }

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    /** Seed storage + prime in-memory map by calling getPublicParams. */
    async function seedAndPrime(
      st: MemoryStorage,
      pkData = makeCachedPk(),
      paramsData = makeCachedParams(),
    ) {
      await st.set(PK_STORAGE_KEY, pkData);
      await st.set(PARAMS_STORAGE_KEY, paramsData);
      await st.set(PARAMS_INDEX_KEY, [2048]);

      const cache = new PublicParamsCache({
        storage: st,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: CACHE_TTL,
      });
      // Prime the in-memory params map so revalidation discovers bits=2048
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(null));
      // Also prime the public key
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));
      return cache;
    }

    it("skips revalidation when TTL has not elapsed", async () => {
      const cache = await seedAndPrime(storage);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("revalidates and returns false when artifacts return 304 (unchanged)", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      mockFetch({ pkStatus: 304, crsStatus: 304 });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);

      // Verify lastValidatedAt was updated
      const pk = await storage.get<{ lastValidatedAt: number }>(PK_STORAGE_KEY);
      expect(pk!.lastValidatedAt).toBeGreaterThan(expired);

      const pp = await storage.get<{ lastValidatedAt: number }>(PARAMS_STORAGE_KEY);
      expect(pp!.lastValidatedAt).toBeGreaterThan(expired);
    });

    it("returns true when PK artifact returns 200 (ETag changed)", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // PK returns 200 = changed
      mockFetch({
        pkStatus: 200,
        pkHeaders: { etag: '"pk-etag-ROTATED"' },
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(true);

      // Cache should be cleared
      expect(await storage.get(PK_STORAGE_KEY)).toBeNull();
      expect(await storage.get(PARAMS_STORAGE_KEY)).toBeNull();
    });

    it("returns true when CRS artifact returns 200 (ETag changed, PK unchanged)", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // PK fresh (304), CRS changed (200)
      mockFetch({
        pkStatus: 304,
        crsStatus: 200,
        crsHeaders: { etag: '"pp-etag-ROTATED"' },
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(true);

      expect(await storage.get(PK_STORAGE_KEY)).toBeNull();
      expect(await storage.get(PARAMS_STORAGE_KEY)).toBeNull();
    });

    it("returns true when artifact URL changes in manifest", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // Manifest returns a different URL for PK
      mockFetch({
        manifest: {
          ...MANIFEST,
          fhePublicKey: {
            dataId: "pk-id-1",
            urls: ["https://new-cdn.example.com/pk-v2.bin"],
          },
        },
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(true);
    });

    it("updates stored ETag and lastModified after successful 304", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired, etag: '"old-etag"' }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // 304 with a new etag header (servers may update weak→strong)
      mockFetch({
        pkStatus: 304,
        pkHeaders: { etag: '"refreshed-etag"' },
        crsStatus: 304,
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);

      const pk = await storage.get<{ etag: string }>(PK_STORAGE_KEY);
      expect(pk!.etag).toBe('"refreshed-etag"');
    });

    it("returns false (fail-open) on network error with short retry", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);

      // Verify lastValidatedAt uses short retry (5 min) instead of full TTL
      const pk = await storage.get<{ lastValidatedAt: number }>(PK_STORAGE_KEY);
      expect(pk).not.toBeNull();
      // Should be set to retry in ~5 min, not full TTL
      const expectedRetry = Date.now() - CACHE_TTL_MS + 5 * 60 * 1000;
      expect(pk!.lastValidatedAt).toBeGreaterThan(expectedRetry - 2000);
      expect(pk!.lastValidatedAt).toBeLessThan(expectedRetry + 2000);
    });

    it("returns false (fail-open) on non-OK manifest response", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      mockFetch({ manifestOk: false, manifestStatus: 500 });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);

      const pk = await storage.get<{ lastValidatedAt: number }>(PK_STORAGE_KEY);
      expect(pk!.lastValidatedAt).toBeGreaterThan(expired);
    });

    it("fheArtifactCacheTTL: 0 always triggers revalidation", async () => {
      await storage.set(PK_STORAGE_KEY, makeCachedPk());
      await storage.set(PARAMS_INDEX_KEY, [2048]);
      await storage.set(PARAMS_STORAGE_KEY, makeCachedParams());

      const cache = new PublicParamsCache({
        storage,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: 0,
      });
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(null));

      // Even with fresh timestamps, TTL=0 should always proceed
      mockFetch({ pkStatus: 304, crsStatus: 304 });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false);
      // Should have fetched manifest + artifact URLs
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("logs warning on network error when logger is provided", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

      await storage.set(PK_STORAGE_KEY, makeCachedPk({ lastValidatedAt: expired }));
      await storage.set(PARAMS_STORAGE_KEY, makeCachedParams({ lastValidatedAt: expired }));
      await storage.set(PARAMS_INDEX_KEY, [2048]);

      const cache = new PublicParamsCache({
        storage,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: CACHE_TTL,
        logger,
      });
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(null));

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
      await cache.revalidateIfDue();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Revalidation failed"),
        expect.objectContaining({ error: "Network failure" }),
      );
    });

    it("does not affect other chain's cache", async () => {
      const OTHER_CHAIN = 1;
      const otherPkKey = `fhe:pubkey:${OTHER_CHAIN}`;
      const otherParamsKey = `fhe:params:${OTHER_CHAIN}:2048`;

      // Seed other chain's cache
      const otherPk = makeCachedPk({ publicKeyId: "other-pk" });
      const otherParams = makeCachedParams({ publicParamsId: "other-pp" });
      await storage.set(otherPkKey, otherPk);
      await storage.set(otherParamsKey, otherParams);

      // Seed main chain with expired data
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // PK artifact changed (200)
      mockFetch({
        pkStatus: 200,
        pkHeaders: { etag: '"pk-etag-ROTATED"' },
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(true);

      // Main chain cleared
      expect(await storage.get(PK_STORAGE_KEY)).toBeNull();

      // Other chain untouched
      const otherPkRaw = await storage.get<{ publicKeyId: string }>(otherPkKey);
      expect(otherPkRaw).not.toBeNull();
      expect(otherPkRaw!.publicKeyId).toBe("other-pk");

      const otherParamsRaw = await storage.get<{ publicParamsId: string }>(otherParamsKey);
      expect(otherParamsRaw).not.toBeNull();
      expect(otherParamsRaw!.publicParamsId).toBe("other-pp");
    });

    it("still returns true (stale) when storage delete fails during clearAll", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;

      // Use a storage that fails on delete
      const failDeleteStorage = {
        get: vi.fn().mockImplementation((key: string) => storage.get(key)),
        set: vi.fn().mockImplementation((key: string, val: unknown) => storage.set(key, val)),
        delete: vi.fn().mockRejectedValue(new Error("delete failed")),
      };

      await storage.set(PK_STORAGE_KEY, makeCachedPk({ lastValidatedAt: expired }));
      await storage.set(PARAMS_STORAGE_KEY, makeCachedParams({ lastValidatedAt: expired }));
      await storage.set(PARAMS_INDEX_KEY, [2048]);

      const cache = new PublicParamsCache({
        storage: failDeleteStorage,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: CACHE_TTL,
      });
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(null));

      // PK artifact changed (200)
      mockFetch({
        pkStatus: 200,
        pkHeaders: { etag: '"pk-etag-ROTATED"' },
      });

      const result = await cache.revalidateIfDue();
      // Should still report stale even though storage delete failed
      expect(result).toBe(true);
    });

    it("discovers CRS from params index on cold start (no in-memory keys)", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;

      // Seed storage directly (simulates cold start — no in-memory map)
      await storage.set(PK_STORAGE_KEY, makeCachedPk({ lastValidatedAt: expired }));
      await storage.set(PARAMS_STORAGE_KEY, makeCachedParams({ lastValidatedAt: expired }));
      await storage.set(PARAMS_INDEX_KEY, [2048]);

      // Create cache WITHOUT priming in-memory (cold start)
      const cache = new PublicParamsCache({
        storage,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: CACHE_TTL,
      });
      // Prime only PK (not params) — simulates a cold start where
      // getPublicParams hasn't been called yet
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));

      // CRS artifact changed (200)
      mockFetch({
        pkStatus: 304,
        crsStatus: 200,
        crsHeaders: { etag: '"pp-etag-ROTATED"' },
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(true);
    });

    it("deletes corrupt cache entry during revalidation and returns false", async () => {
      // Seed PK with corrupt data (missing publicKey field)
      await storage.set(PK_STORAGE_KEY, { publicKeyId: 42, notAKey: true });

      const cache = new PublicParamsCache({
        storage,
        chainId: CHAIN_ID,
        relayerUrl: RELAYER_URL,
        fheArtifactCacheTTL: CACHE_TTL,
      });

      const result = await cache.revalidateIfDue();
      // No valid cached PK → returns false (nothing to revalidate)
      expect(result).toBe(false);

      // Corrupt entry should have been deleted
      expect(await storage.get(PK_STORAGE_KEY)).toBeNull();
    });

    it("first revalidation captures validators via HEAD and treats cache as fresh", async () => {
      const expired = Date.now() - CACHE_TTL_MS - 1000;
      // Seed WITHOUT artifact metadata (simulates first revalidation after initial fetch)
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({
          lastValidatedAt: expired,
          artifactUrl: undefined as unknown as string,
          etag: undefined as unknown as string,
          lastModified: undefined as unknown as string,
        }),
        makeCachedParams({
          lastValidatedAt: expired,
          artifactUrl: undefined as unknown as string,
          etag: undefined as unknown as string,
          lastModified: undefined as unknown as string,
        }),
      );

      // HEAD requests return validators (no conditional headers sent)
      globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = String(url);
        if (urlStr === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(MANIFEST),
          });
        }
        if (urlStr === PK_ARTIFACT_URL || urlStr === CRS_ARTIFACT_URL) {
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers({
              etag: '"newly-captured-etag"',
              "last-modified": "Mon, 01 Jan 2025 00:00:00 GMT",
            }),
            body: null,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const result = await cache.revalidateIfDue();
      expect(result).toBe(false); // Fresh — first time just captures validators

      // Validators should now be stored
      const pk = await storage.get<{ etag: string; artifactUrl: string }>(PK_STORAGE_KEY);
      expect(pk!.etag).toBe('"newly-captured-etag"');
      expect(pk!.artifactUrl).toBe(PK_ARTIFACT_URL);
    });
  });

  // ── Concurrent access ─────────────────────────────────────────

  describe("concurrent access", () => {
    it("deduplicates concurrent getPublicKey calls", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1]) };
      let resolveDeferred!: (v: typeof pk) => void;
      const fetcher = vi.fn().mockReturnValue(
        new Promise<typeof pk>((resolve) => {
          resolveDeferred = resolve;
        }),
      );

      // Fire two concurrent calls
      const p1 = cache.getPublicKey(fetcher);
      const p2 = cache.getPublicKey(fetcher);

      resolveDeferred(pk);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual(pk);
      expect(r2).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent getPublicParams calls", async () => {
      const cache = new PublicParamsCache({
        storage,
        chainId: 11155111,
        relayerUrl: DUMMY_RELAYER_URL,
      });
      const pp = { publicParamsId: "pp1", publicParams: new Uint8Array([1]) };
      let resolveDeferred!: (v: typeof pp) => void;
      const fetcher = vi.fn().mockReturnValue(
        new Promise<typeof pp>((resolve) => {
          resolveDeferred = resolve;
        }),
      );

      const p1 = cache.getPublicParams(2048, fetcher);
      const p2 = cache.getPublicParams(2048, fetcher);

      resolveDeferred(pp);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual(pp);
      expect(r2).toEqual(pp);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent revalidateIfDue calls", async () => {
      const CHAIN_ID = 11155111;
      const expired = Date.now() - 120_000;

      await storage.set(`fhe:pubkey:${CHAIN_ID}`, {
        publicKeyId: "pk-1",
        publicKey: btoa(String.fromCharCode(1)),
        artifactUrl: "https://cdn.example.com/pk.bin",
        etag: '"pk-etag"',
        lastValidatedAt: expired,
      });
      await storage.set(`fhe:params-index:${CHAIN_ID}`, []);

      const cache = new PublicParamsCache({
        storage,
        chainId: CHAIN_ID,
        relayerUrl: DUMMY_RELAYER_URL,
        fheArtifactCacheTTL: 60,
      });
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));

      // Use a deferred promise for the manifest fetch so we can control timing
      let resolveManifest!: (v: unknown) => void;
      const manifestPromise = new Promise((resolve) => {
        resolveManifest = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
        if (String(url).includes("/keyurl")) {
          return manifestPromise;
        }
        return Promise.resolve({
          status: 304,
          ok: true,
          headers: new Headers({ etag: '"pk-etag"' }),
          body: null,
        });
      });

      const p1 = cache.revalidateIfDue();
      // Let p1 progress through storage reads to the fetch call
      await new Promise((r) => setTimeout(r, 0));
      const p2 = cache.revalidateIfDue();

      resolveManifest({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            fhePublicKey: { urls: ["https://cdn.example.com/pk.bin"] },
          }),
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(false);
      expect(r2).toBe(false);
      // Only one manifest fetch (p2 coalesced with p1)
      expect(globalThis.fetch).toHaveBeenCalledTimes(2); // manifest + conditional GET for pk
    });
  });
});
