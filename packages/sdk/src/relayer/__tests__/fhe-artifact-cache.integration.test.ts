import { randomBytes } from "node:crypto";
import http from "node:http";
import { test as base, describe, expect } from "vitest";
import { MemoryStorage } from "../../token/memory-storage";
import { ArtifactCache } from "../artifact-cache";

// ── Test HTTP server ────────────────────────────────────────

interface TestServer {
  baseUrl: string;
  rotatePk: () => void;
  rotateCrs: () => void;
}

/** Size of fake binary artifacts served by the test server (bytes). */
const FAKE_BIN_SIZE = 1024;

function createTestServer(): { server: http.Server; start: () => Promise<TestServer> } {
  let pkEtag = '"pk-etag-v1"';
  let crsEtag = '"crs-etag-v1"';
  let pkBody = randomBytes(FAKE_BIN_SIZE);
  let crsBody = randomBytes(FAKE_BIN_SIZE);
  const pkPath = "/artifacts/pk.bin";
  const crsPath = "/artifacts/crs-2048.bin";

  const server = http.createServer((req, res) => {
    const url = req.url ?? "";

    if (url === "/keyurl") {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const base = `http://127.0.0.1:${port}`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          fhePublicKey: { dataId: "pk-id-1", urls: [`${base}${pkPath}`] },
          crs: { 2048: { dataId: "crs-id-1", urls: [`${base}${crsPath}`] } },
        }),
      );
      return;
    }

    if (url === pkPath || url === crsPath) {
      const etag = url === pkPath ? pkEtag : crsEtag;
      const body = url === pkPath ? pkBody : crsBody;
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return;
      }
      res.writeHead(200, {
        ETag: etag,
        "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    start: () =>
      new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          resolve({
            baseUrl: `http://127.0.0.1:${port}`,
            rotatePk() {
              pkEtag = `"pk-etag-v${Date.now()}"`;
              pkBody = randomBytes(FAKE_BIN_SIZE);
            },
            rotateCrs() {
              crsEtag = `"crs-etag-v${Date.now()}"`;
              crsBody = randomBytes(FAKE_BIN_SIZE);
            },
          });
        });
      }),
  };
}

// ── Test fixtures ───────────────────────────────────────────

const CHAIN_ID = 11155111;

interface CacheFixtures {
  testServer: TestServer;
  storage: MemoryStorage;
  cache: ArtifactCache;
  /** Create a fresh cache instance sharing the same storage (simulates app restart). */
  createCache: (opts?: { ttl?: number; relayerUrl?: string }) => ArtifactCache;
  pkFetcher: () => Promise<{ publicKeyId: string; publicKey: Uint8Array }>;
  paramsFetcher: () => Promise<{ publicParamsId: string; publicParams: Uint8Array }>;
}

/* eslint-disable no-empty-pattern */
const test = base.extend<CacheFixtures>({
  testServer: async ({}, use) => {
    const { server, start } = createTestServer();
    const ts = await start();
    await use(ts);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },

  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },

  createCache: async ({ testServer, storage }, use) => {
    await use(
      (opts) =>
        new ArtifactCache({
          storage,
          chainId: CHAIN_ID,
          relayerUrl: opts?.relayerUrl ?? testServer.baseUrl,
          ttl: opts?.ttl ?? 1,
        }),
    );
  },

  cache: async ({ createCache }, use) => {
    await use(createCache());
  },

  pkFetcher: async ({}, use) => {
    await use(async () => ({
      publicKeyId: "pk-id-1",
      publicKey: new Uint8Array([1, 2, 3]),
    }));
  },

  paramsFetcher: async ({}, use) => {
    await use(async () => ({
      publicParamsId: "crs-id-1",
      publicParams: new Uint8Array([4, 5, 6]),
    }));
  },
});

// ── Tests ───────────────────────────────────────────────────

describe("ArtifactCache integration (real HTTP)", () => {
  test("full lifecycle: fetch → persist → restore → revalidate (304) → rotate → detect stale", async ({
    cache,
    storage,
    createCache,
    testServer,
    pkFetcher,
    paramsFetcher,
  }) => {
    // Step 1: First instance fetches and persists
    const pk1 = await cache.getPublicKey(pkFetcher);
    expect(pk1).not.toBeNull();
    expect(pk1!.publicKeyId).toBe("pk-id-1");

    const pp1 = await cache.getPublicParams(2048, paramsFetcher);
    expect(pp1).not.toBeNull();
    expect(pp1!.publicParamsId).toBe("crs-id-1");

    // Step 2: New instance restores from storage (no fetcher needed)
    const cache2 = createCache();
    const pk2 = await cache2.getPublicKey(async () => {
      throw new Error("Fetcher should not be called — cache hit");
    });
    expect(pk2).toEqual(pk1);

    const pp2 = await cache2.getPublicParams(2048, async () => {
      throw new Error("Fetcher should not be called — cache hit");
    });
    expect(pp2).toEqual(pp1);

    // Step 3: Wait for TTL, revalidate — first time captures ETags
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache2.revalidateIfDue()).toBe(false);

    // Step 4: Wait again, revalidate — 304, still fresh
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache2.revalidateIfDue()).toBe(false);

    // Step 5: Rotate PK, revalidate → stale
    testServer.rotatePk();
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache2.revalidateIfDue()).toBe(true);

    // Storage should be cleared
    expect(await storage.get(`fhe:pubkey:${CHAIN_ID}`)).toBeNull();
  });

  test("survives server errors with fail-open", async ({
    createCache,
    pkFetcher,
    paramsFetcher,
  }) => {
    const cache = createCache({ relayerUrl: "http://127.0.0.1:1" }); // guaranteed connection refused

    // Populate via fetcher (bypasses relayer)
    await cache.getPublicKey(pkFetcher);
    await cache.getPublicParams(2048, paramsFetcher);

    // Revalidation should fail-open
    expect(await cache.revalidateIfDue()).toBe(false);

    // Cached data still accessible
    const pk = await cache.getPublicKey(async () => null);
    expect(pk).not.toBeNull();
  });

  test("skips revalidation when relayerUrl is empty", async ({ createCache, pkFetcher }) => {
    const cache = createCache({ relayerUrl: "" });
    await cache.getPublicKey(pkFetcher);

    expect(await cache.revalidateIfDue()).toBe(false);
  });

  test("CRS rotation detected independently from PK", async ({
    cache,
    testServer,
    pkFetcher,
    paramsFetcher,
  }) => {
    await cache.getPublicKey(pkFetcher);
    await cache.getPublicParams(2048, paramsFetcher);

    // First revalidation — captures ETags
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.revalidateIfDue()).toBe(false);

    // Second revalidation with matching ETags — fresh
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.revalidateIfDue()).toBe(false);

    // Rotate only CRS (PK unchanged)
    testServer.rotateCrs();
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cache.revalidateIfDue()).toBe(true);
  });
});
