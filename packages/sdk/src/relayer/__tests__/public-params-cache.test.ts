import { describe, it, expect, beforeEach, vi } from "vitest";
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
