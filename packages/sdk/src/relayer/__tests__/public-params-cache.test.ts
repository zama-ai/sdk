import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStorage } from "../../token/memory-storage";
import { PublicParamsCache } from "../public-params-cache";

describe("PublicParamsCache", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  // ── getPublicKey ──────────────────────────────────────────────

  describe("getPublicKey", () => {
    it("returns cached public key without calling fetcher on cache hit", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
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
      const cache1 = new PublicParamsCache(storage, 11155111);
      await cache1.getPublicKey(fetcher);
      expect(fetcher).toHaveBeenCalledOnce();

      // New cache instance, same storage — should restore without fetching
      const cache2 = new PublicParamsCache(storage, 11155111);
      const fetcher2 = vi.fn().mockResolvedValue(null);
      const result = await cache2.getPublicKey(fetcher2);

      expect(result).toEqual(pk);
      expect(fetcher2).not.toHaveBeenCalled();
    });

    it("uses different cache keys per chain ID", async () => {
      const pk1 = { publicKeyId: "sepolia", publicKey: new Uint8Array([1]) };
      const pk2 = { publicKeyId: "mainnet", publicKey: new Uint8Array([2]) };

      const cache1 = new PublicParamsCache(storage, 11155111);
      await cache1.getPublicKey(vi.fn().mockResolvedValue(pk1));

      const cache2 = new PublicParamsCache(storage, 1);
      const fetcher2 = vi.fn().mockResolvedValue(pk2);
      const result = await cache2.getPublicKey(fetcher2);

      // Different chain → must fetch again
      expect(fetcher2).toHaveBeenCalledOnce();
      expect(result).toEqual(pk2);
    });

    it("returns null and does not cache when fetcher returns null", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
      const fetcher = vi.fn().mockResolvedValue(null);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toBeNull();

      // Next call should try again since null wasn't cached
      const fetcher2 = vi.fn().mockResolvedValue(null);
      await cache.getPublicKey(fetcher2);
      expect(fetcher2).toHaveBeenCalledOnce();
    });

    it("falls back to fetcher when storage read fails", async () => {
      const badStorage: MemoryStorage = {
        getItem: vi.fn().mockRejectedValue(new Error("read failed")),
        setItem: vi.fn().mockResolvedValue(undefined),
        removeItem: vi.fn().mockResolvedValue(undefined),
      } as unknown as MemoryStorage;

      const cache = new PublicParamsCache(badStorage, 11155111);
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("still returns data when storage write fails", async () => {
      const badStorage: MemoryStorage = {
        getItem: vi.fn().mockResolvedValue(null),
        setItem: vi.fn().mockRejectedValue(new Error("write failed")),
        removeItem: vi.fn().mockResolvedValue(undefined),
      } as unknown as MemoryStorage;

      const cache = new PublicParamsCache(badStorage, 11155111);
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      const fetcher = vi.fn().mockResolvedValue(pk);

      const result = await cache.getPublicKey(fetcher);
      expect(result).toEqual(pk);
    });
  });

  // ── getPublicParams ───────────────────────────────────────────

  describe("getPublicParams", () => {
    it("returns cached public params without calling fetcher on cache hit", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
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

      const cache1 = new PublicParamsCache(storage, 11155111);
      await cache1.getPublicParams(2048, fetcher);

      const cache2 = new PublicParamsCache(storage, 11155111);
      const fetcher2 = vi.fn().mockResolvedValue(null);
      const result = await cache2.getPublicParams(2048, fetcher2);

      expect(result).toEqual(pp);
      expect(fetcher2).not.toHaveBeenCalled();
    });

    it("uses different cache keys per bit size", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
      const pp2048 = { publicParamsId: "pp-2048", publicParams: new Uint8Array([1]) };
      const pp4096 = { publicParamsId: "pp-4096", publicParams: new Uint8Array([2]) };

      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(pp2048));
      const fetcher4096 = vi.fn().mockResolvedValue(pp4096);
      const result = await cache.getPublicParams(4096, fetcher4096);

      expect(fetcher4096).toHaveBeenCalledOnce();
      expect(result).toEqual(pp4096);
    });

    it("returns null and does not cache when fetcher returns null", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
      const fetcher = vi.fn().mockResolvedValue(null);

      const result = await cache.getPublicParams(2048, fetcher);
      expect(result).toBeNull();

      const fetcher2 = vi.fn().mockResolvedValue(null);
      await cache.getPublicParams(2048, fetcher2);
      expect(fetcher2).toHaveBeenCalledOnce();
    });
  });

  // ── revalidateIfDue ─────────────────────────────────────────

  describe("revalidateIfDue", () => {
    const CHAIN_ID = 11155111;
    const RELAYER_URL = "https://relayer.example.com";
    const INTERVAL_MS = 60_000;
    const PK_STORAGE_KEY = `fhe:pubkey:${CHAIN_ID}`;
    const PARAMS_STORAGE_KEY = `fhe:params:${CHAIN_ID}:2048`;

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
        artifactUrl: "https://cdn.example.com/pk.bin",
        etag: '"etag-pk-1"',
        lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
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
        artifactUrl: "https://cdn.example.com/params-2048.bin",
        etag: '"etag-pp-1"',
        lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
        lastValidatedAt: Date.now(),
        ...overrides,
      };
    }

    const MANIFEST = {
      fhePublicKey: {
        dataId: "pk-id-1",
        urls: ["https://cdn.example.com/pk.bin"],
      },
      crs: {
        2048: {
          dataId: "pp-id-1",
          urls: ["https://cdn.example.com/params-2048.bin"],
        },
      },
    };

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    /** Helper: seed storage + prime in-memory map by calling getPublicParams */
    async function seedAndPrime(
      st: MemoryStorage,
      pkData = makeCachedPk(),
      paramsData = makeCachedParams(),
    ) {
      await st.setItem(PK_STORAGE_KEY, JSON.stringify(pkData));
      await st.setItem(PARAMS_STORAGE_KEY, JSON.stringify(paramsData));

      const cache = new PublicParamsCache(st, CHAIN_ID);
      // Prime the in-memory params map so revalidation discovers bits=2048
      await cache.getPublicParams(2048, vi.fn().mockResolvedValue(null));
      // Also prime the public key
      await cache.getPublicKey(vi.fn().mockResolvedValue(null));
      return cache;
    }

    it("skips revalidation when interval has not elapsed", async () => {
      const cache = await seedAndPrime(storage);

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("revalidates and returns false on 304", async () => {
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MANIFEST),
          });
        }
        // HEAD requests return 304
        if (init?.method === "HEAD") {
          return Promise.resolve({
            status: 304,
            headers: new Headers(),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(false);

      // Verify lastValidatedAt was updated
      const pkRaw = await storage.getItem(PK_STORAGE_KEY);
      const pk = JSON.parse(pkRaw!);
      expect(pk.lastValidatedAt).toBeGreaterThan(expired);

      const ppRaw = await storage.getItem(PARAMS_STORAGE_KEY);
      const pp = JSON.parse(ppRaw!);
      expect(pp.lastValidatedAt).toBeGreaterThan(expired);
    });

    it("returns true when ETag changes", async () => {
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MANIFEST),
          });
        }
        if (init?.method === "HEAD") {
          return Promise.resolve({
            status: 200,
            headers: new Headers({
              etag: '"etag-pk-CHANGED"',
              "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT",
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(true);

      // Cache should be cleared
      expect(await storage.getItem(PK_STORAGE_KEY)).toBeNull();
      expect(await storage.getItem(PARAMS_STORAGE_KEY)).toBeNull();
    });

    it("returns true when Last-Modified changes", async () => {
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired, etag: undefined }),
        makeCachedParams({ lastValidatedAt: expired, etag: undefined }),
      );

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MANIFEST),
          });
        }
        if (init?.method === "HEAD") {
          return Promise.resolve({
            status: 200,
            headers: new Headers({
              "last-modified": "Tue, 02 Jan 2024 12:00:00 GMT",
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(true);

      expect(await storage.getItem(PK_STORAGE_KEY)).toBeNull();
    });

    it("returns true when manifest URL changes", async () => {
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      const changedManifest = {
        fhePublicKey: {
          dataId: "pk-id-1",
          urls: ["https://cdn.example.com/pk-v2.bin"],
        },
        crs: MANIFEST.crs,
      };

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(changedManifest),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(true);

      // Only 1 fetch (the manifest), no HEAD requests needed
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(await storage.getItem(PK_STORAGE_KEY)).toBeNull();
    });

    it("returns false (fail-open) on network error", async () => {
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(false);

      // Verify lastValidatedAt was updated (fail-open prevents retry storm)
      const pkRaw = await storage.getItem(PK_STORAGE_KEY);
      expect(pkRaw).not.toBeNull();
      const pk = JSON.parse(pkRaw!);
      expect(pk.lastValidatedAt).toBeGreaterThan(expired);
    });

    it("does not affect other chain's cache", async () => {
      const OTHER_CHAIN = 1;
      const otherPkKey = `fhe:pubkey:${OTHER_CHAIN}`;
      const otherParamsKey = `fhe:params:${OTHER_CHAIN}:2048`;

      // Seed other chain's cache
      const otherPk = makeCachedPk({ publicKeyId: "other-pk" });
      const otherParams = makeCachedParams({ publicParamsId: "other-pp" });
      await storage.setItem(otherPkKey, JSON.stringify(otherPk));
      await storage.setItem(otherParamsKey, JSON.stringify(otherParams));

      // Seed main chain with expired data
      const expired = Date.now() - INTERVAL_MS - 1000;
      const cache = await seedAndPrime(
        storage,
        makeCachedPk({ lastValidatedAt: expired }),
        makeCachedParams({ lastValidatedAt: expired }),
      );

      // Make main chain stale via etag change
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === `${RELAYER_URL}/keyurl`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MANIFEST),
          });
        }
        if (init?.method === "HEAD") {
          return Promise.resolve({
            status: 200,
            headers: new Headers({ etag: '"etag-CHANGED"' }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const result = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_MS);
      expect(result).toBe(true);

      // Main chain cleared
      expect(await storage.getItem(PK_STORAGE_KEY)).toBeNull();

      // Other chain untouched
      const otherPkRaw = await storage.getItem(otherPkKey);
      expect(otherPkRaw).not.toBeNull();
      expect(JSON.parse(otherPkRaw!).publicKeyId).toBe("other-pk");

      const otherParamsRaw = await storage.getItem(otherParamsKey);
      expect(otherParamsRaw).not.toBeNull();
      expect(JSON.parse(otherParamsRaw!).publicParamsId).toBe("other-pp");
    });
  });

  // ── Concurrent access ─────────────────────────────────────────

  describe("concurrent access", () => {
    it("deduplicates concurrent getPublicKey calls", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1]) };
      let resolveDeferred!: (v: typeof pk) => void;
      const fetcher = vi.fn().mockReturnValue(
        new Promise<typeof pk>((resolve) => {
          resolveDeferred = resolve;
        }),
      );

      const p1 = cache.getPublicKey(fetcher);
      const p2 = cache.getPublicKey(fetcher);

      resolveDeferred(pk);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual(pk);
      expect(r2).toEqual(pk);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("deduplicates concurrent getPublicParams calls for same bits", async () => {
      const cache = new PublicParamsCache(storage, 11155111);
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
  });
});
