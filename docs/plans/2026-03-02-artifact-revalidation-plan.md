# Artifact-Level Revalidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add periodic revalidation of cached FHE public key and CRS so the SDK detects key rotation and refreshes stale entries.

**Architecture:** Extend `PublicParamsCache` with a `revalidateIfDue()` method that fetches the `/v2/keyurl` manifest, performs conditional HTTP requests against artifact URLs, and clears the cache when validators differ. `RelayerWeb`/`RelayerNode` call this during `#ensureWorkerInner()`/`#ensurePoolInner()` and tear down the worker on staleness.

**Tech Stack:** TypeScript, Vitest, fetch API (global in browser + Node 18+)

**Design doc:** `docs/plans/2026-03-02-artifact-revalidation-design.md`

---

### Task 1: Extend cache metadata types and storage helpers

**Files:**

- Modify: `packages/sdk/src/relayer/public-params-cache.ts`

**Step 1: Update the `CachedPublicKey` and `CachedPublicParams` interfaces**

Add optional revalidation metadata fields to both interfaces. These are backwards-compatible — existing cached entries will simply have `undefined` for these fields:

```ts
interface CachedPublicKey {
  publicKeyId: string;
  publicKey: string;
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt?: number;
}

interface CachedPublicParams {
  publicParamsId: string;
  publicParams: string;
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt?: number;
}
```

**Step 2: Add a `storageKey()` helper and a `METADATA_KEY` constant**

Add a helper to compute storage keys (DRY up existing `fhe:pubkey:` and `fhe:params:` patterns) and a metadata-only key for storing revalidation timestamps without the binary payload:

```ts
function pubkeyStorageKey(chainId: number): string {
  return `fhe:pubkey:${chainId}`;
}

function paramsStorageKey(chainId: number, bits: number): string {
  return `fhe:params:${chainId}:${bits}`;
}
```

Replace the inline `fhe:pubkey:${this.#chainId}` and `fhe:params:${this.#chainId}:${bits}` with calls to these helpers.

**Step 3: Run existing tests to verify no regressions**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/public-params-cache.test.ts`
Expected: All existing tests PASS (the metadata fields are optional, so nothing breaks)

**Step 4: Commit**

```
feat(sdk): extend cache metadata types for revalidation support
```

---

### Task 2: Write revalidation tests (TDD - tests first)

**Files:**

- Modify: `packages/sdk/src/relayer/__tests__/public-params-cache.test.ts`

**Step 1: Add a new `describe("revalidateIfDue")` block with all 7 test cases**

Add these tests after the existing `describe` blocks. They will all fail initially since `revalidateIfDue` doesn't exist yet.

Mock `globalThis.fetch` in the test setup. Create helper fixtures for manifest and HEAD responses.

```ts
describe("revalidateIfDue", () => {
  const RELAYER_URL = "https://relayer.example.com/v2";
  const ARTIFACT_PK_URL = "https://cdn.example.com/pk.bin";
  const ARTIFACT_CRS_URL = "https://cdn.example.com/crs-2048.bin";
  const INTERVAL_24H = 86_400_000;

  // Manifest response shape from /v2/keyurl
  const MANIFEST = {
    fhePublicKey: {
      dataId: "pk-data-id-1",
      urls: [ARTIFACT_PK_URL],
    },
    crs: {
      2048: {
        dataId: "crs-data-id-1",
        urls: [ARTIFACT_CRS_URL],
      },
    },
  };

  function mockFetch(
    responses: Record<string, { status: number; headers?: Record<string, string>; body?: unknown }>,
  ) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const key = Object.keys(responses).find((k) => url.includes(k));
      const resp = key ? responses[key] : { status: 500 };
      return {
        ok: resp.status >= 200 && resp.status < 400,
        status: resp.status,
        headers: new Headers(resp.headers ?? {}),
        json: async () => resp.body,
      } as Response;
    });
  }

  async function seedCache(
    storage: MemoryStorage,
    chainId: number,
    overrides?: {
      artifactUrl?: string;
      etag?: string;
      lastModified?: string;
      lastValidatedAt?: number;
    },
  ) {
    const cache = new PublicParamsCache(storage, chainId);
    // Manually write cache entries with metadata
    const pkKey = `fhe:pubkey:${chainId}`;
    const ppKey = `fhe:params:${chainId}:2048`;
    await storage.setItem(
      pkKey,
      JSON.stringify({
        publicKeyId: "pk-data-id-1",
        publicKey: btoa(String.fromCharCode(1, 2, 3)),
        artifactUrl: overrides?.artifactUrl ?? ARTIFACT_PK_URL,
        etag: overrides?.etag ?? '"etag-pk-1"',
        lastModified: overrides?.lastModified ?? "Wed, 01 Jan 2025 00:00:00 GMT",
        lastValidatedAt: overrides?.lastValidatedAt ?? Date.now(),
      }),
    );
    await storage.setItem(
      ppKey,
      JSON.stringify({
        publicParamsId: "crs-data-id-1",
        publicParams: btoa(String.fromCharCode(4, 5, 6)),
        artifactUrl: overrides?.artifactUrl ?? ARTIFACT_CRS_URL,
        etag: overrides?.etag ?? '"etag-crs-1"',
        lastModified: overrides?.lastModified ?? "Wed, 01 Jan 2025 00:00:00 GMT",
        lastValidatedAt: overrides?.lastValidatedAt ?? Date.now(),
      }),
    );
    return cache;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips revalidation when interval has not elapsed", async () => {
    const fetchSpy = mockFetch({});
    globalThis.fetch = fetchSpy;
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: Date.now() - 1000, // 1 second ago
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("revalidates and returns false on 304 (not modified)", async () => {
    const fetchSpy = mockFetch({
      "/keyurl": { status: 200, body: MANIFEST },
      [ARTIFACT_PK_URL]: { status: 304 },
      [ARTIFACT_CRS_URL]: { status: 304 },
    });
    globalThis.fetch = fetchSpy;
    const now = Date.now();
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: now - INTERVAL_24H - 1000, // expired
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(false);
    // Verify lastValidatedAt was updated
    const stored = JSON.parse((await storage.getItem(`fhe:pubkey:11155111`))!);
    expect(stored.lastValidatedAt).toBeGreaterThanOrEqual(now);
  });

  it("returns true when ETag changes", async () => {
    const fetchSpy = mockFetch({
      "/keyurl": { status: 200, body: MANIFEST },
      [ARTIFACT_PK_URL]: { status: 200, headers: { etag: '"etag-pk-NEW"' } },
    });
    globalThis.fetch = fetchSpy;
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: Date.now() - INTERVAL_24H - 1000,
      etag: '"etag-pk-1"',
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(true);
    // Cache should be cleared
    expect(await storage.getItem(`fhe:pubkey:11155111`)).toBeNull();
    expect(await storage.getItem(`fhe:params:11155111:2048`)).toBeNull();
  });

  it("returns true when Last-Modified changes", async () => {
    const fetchSpy = mockFetch({
      "/keyurl": { status: 200, body: MANIFEST },
      [ARTIFACT_PK_URL]: {
        status: 200,
        headers: { "last-modified": "Fri, 01 Mar 2026 00:00:00 GMT" },
      },
    });
    globalThis.fetch = fetchSpy;
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: Date.now() - INTERVAL_24H - 1000,
      etag: undefined, // no etag, use last-modified
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(true);
  });

  it("returns true when manifest URL changes (without artifact HEAD)", async () => {
    const NEW_PK_URL = "https://cdn.example.com/pk-v2.bin";
    const manifest = {
      ...MANIFEST,
      fhePublicKey: { ...MANIFEST.fhePublicKey, urls: [NEW_PK_URL] },
    };
    const fetchSpy = mockFetch({
      "/keyurl": { status: 200, body: manifest },
    });
    globalThis.fetch = fetchSpy;
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: Date.now() - INTERVAL_24H - 1000,
      artifactUrl: ARTIFACT_PK_URL, // old URL
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(true);
    // Should not have made a HEAD request since URL change is sufficient
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only manifest fetch
  });

  it("returns false (fail-open) on network error with cached data", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));
    globalThis.fetch = fetchSpy;
    const now = Date.now();
    const cache = await seedCache(storage, 11155111, {
      lastValidatedAt: now - INTERVAL_24H - 1000,
    });

    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(false);
    // lastValidatedAt should be updated to prevent retry storm
    const stored = JSON.parse((await storage.getItem(`fhe:pubkey:11155111`))!);
    expect(stored.lastValidatedAt).toBeGreaterThanOrEqual(now);
  });

  it("does not affect other chain's cache", async () => {
    const fetchSpy = mockFetch({
      "/keyurl": { status: 200, body: MANIFEST },
      [ARTIFACT_PK_URL]: { status: 200, headers: { etag: '"etag-pk-NEW"' } },
    });
    globalThis.fetch = fetchSpy;

    // Seed both chains
    await seedCache(storage, 11155111, {
      lastValidatedAt: Date.now() - INTERVAL_24H - 1000,
    });
    await seedCache(storage, 1, {
      lastValidatedAt: Date.now(), // fresh
    });

    // Revalidate chain 11155111 only
    const cache = new PublicParamsCache(storage, 11155111);
    const stale = await cache.revalidateIfDue(RELAYER_URL, INTERVAL_24H);

    expect(stale).toBe(true);
    // Chain 1 cache should be untouched
    expect(await storage.getItem(`fhe:pubkey:1`)).not.toBeNull();
    expect(await storage.getItem(`fhe:params:1:2048`)).not.toBeNull();
  });
});
```

**Step 2: Run the tests to confirm they all fail**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/public-params-cache.test.ts`
Expected: All 7 new tests FAIL (method `revalidateIfDue` does not exist)

**Step 3: Commit**

```
test(sdk): add revalidation test cases for PublicParamsCache
```

---

### Task 3: Implement `revalidateIfDue()` in PublicParamsCache

**Files:**

- Modify: `packages/sdk/src/relayer/public-params-cache.ts`

**Step 1: Add the `revalidateIfDue` method**

Add this method to the `PublicParamsCache` class:

```ts
/**
 * Check whether cached artifacts are due for revalidation and, if so,
 * perform conditional HTTP requests against the actual artifact URLs.
 *
 * @returns `true` if the cache was invalidated (caller should tear down the worker).
 */
async revalidateIfDue(relayerUrl: string, intervalMs: number): Promise<boolean> {
  try {
    // 1. Check timing — read metadata from storage
    const pkKey = pubkeyStorageKey(this.#chainId);
    const storedPkRaw = await this.#storage.getItem(pkKey);
    if (!storedPkRaw) return false; // nothing cached, nothing to revalidate

    const storedPk = JSON.parse(storedPkRaw) as CachedPublicKey;
    const now = Date.now();

    // Collect all params keys that exist in storage for this chain
    // We track which bits are cached by scanning for known key pattern
    const paramEntries: Array<{ bits: number; key: string; data: CachedPublicParams }> = [];
    for (const bits of this.#publicParamsMem.keys()) {
      const key = paramsStorageKey(this.#chainId, bits);
      const raw = await this.#storage.getItem(key);
      if (raw) paramEntries.push({ bits, key, data: JSON.parse(raw) as CachedPublicParams });
    }

    // Check if ALL entries are within the interval
    const allFresh =
      storedPk.lastValidatedAt !== undefined &&
      now - storedPk.lastValidatedAt < intervalMs &&
      paramEntries.every(
        (e) => e.data.lastValidatedAt !== undefined && now - e.data.lastValidatedAt < intervalMs,
      );
    if (allFresh) return false;

    // 2. Fetch manifest
    const manifestResp = await fetch(`${relayerUrl}/keyurl`);
    if (!manifestResp.ok) {
      // Fail-open: can't reach manifest, update timestamps to avoid retry storm
      await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
      return false;
    }
    const manifest = await manifestResp.json();

    // 3. Check public key artifact
    const manifestPkUrl = manifest.fhePublicKey?.urls?.[0];
    const manifestPkId = manifest.fhePublicKey?.dataId;

    // Fast-path: URL or dataId changed
    if (manifestPkUrl && storedPk.artifactUrl && manifestPkUrl !== storedPk.artifactUrl) {
      await this.#clearAll(pkKey, paramEntries);
      return true;
    }
    if (manifestPkId && manifestPkId !== storedPk.publicKeyId) {
      await this.#clearAll(pkKey, paramEntries);
      return true;
    }

    // Conditional request on public key artifact
    if (manifestPkUrl) {
      const stale = await this.#checkArtifactFreshness(manifestPkUrl, storedPk);
      if (stale) {
        await this.#clearAll(pkKey, paramEntries);
        return true;
      }
    }

    // 4. Check each CRS artifact
    for (const entry of paramEntries) {
      const manifestCrs = manifest.crs?.[entry.bits];
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
      if (manifestCrsUrl) {
        const stale = await this.#checkArtifactFreshness(manifestCrsUrl, entry.data);
        if (stale) {
          await this.#clearAll(pkKey, paramEntries);
          return true;
        }
      }
    }

    // 5. All fresh — update timestamps
    await this.#updateValidationTimestamps(pkKey, storedPk, paramEntries, now);
    return false;
  } catch {
    // 6. Fail-open on any error
    try {
      const pkKey = pubkeyStorageKey(this.#chainId);
      const raw = await this.#storage.getItem(pkKey);
      if (raw) {
        const data = JSON.parse(raw) as CachedPublicKey;
        data.lastValidatedAt = Date.now();
        await this.#storage.setItem(pkKey, JSON.stringify(data));
      }
    } catch {
      // Double-fault — give up silently
    }
    return false;
  }
}
```

**Step 2: Add the private helper methods**

```ts
async #checkArtifactFreshness(
  artifactUrl: string,
  cached: { etag?: string; lastModified?: string },
): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (cached.etag) {
    headers["If-None-Match"] = cached.etag;
  } else if (cached.lastModified) {
    headers["If-Modified-Since"] = cached.lastModified;
  }

  const resp = await fetch(artifactUrl, { method: "HEAD", headers });

  if (resp.status === 304) return false; // not modified

  // Compare validators from response
  const respEtag = resp.headers.get("etag");
  const respLastModified = resp.headers.get("last-modified");

  if (cached.etag && respEtag && cached.etag !== respEtag) return true;
  if (cached.lastModified && respLastModified && cached.lastModified !== respLastModified) return true;

  return false; // no change detected or no validators to compare
}

async #clearAll(
  pkKey: string,
  paramEntries: Array<{ key: string }>,
): Promise<void> {
  // Clear in-memory caches
  this.#publicKeyMem = undefined;
  this.#publicParamsMem.clear();

  // Clear persistent storage (best-effort)
  try { await this.#storage.removeItem(pkKey); } catch { /* ignore */ }
  for (const entry of paramEntries) {
    try { await this.#storage.removeItem(entry.key); } catch { /* ignore */ }
  }
}

async #updateValidationTimestamps(
  pkKey: string,
  storedPk: CachedPublicKey,
  paramEntries: Array<{ key: string; data: CachedPublicParams }>,
  now: number,
): Promise<void> {
  storedPk.lastValidatedAt = now;
  try { await this.#storage.setItem(pkKey, JSON.stringify(storedPk)); } catch { /* ignore */ }
  for (const entry of paramEntries) {
    entry.data.lastValidatedAt = now;
    try { await this.#storage.setItem(entry.key, JSON.stringify(entry.data)); } catch { /* ignore */ }
  }
}
```

**Step 3: Run the revalidation tests**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/public-params-cache.test.ts`
Expected: All 7 new tests PASS, all existing tests still PASS

**Step 4: Commit**

```
feat(sdk): implement revalidateIfDue in PublicParamsCache
```

---

### Task 4: Store artifact metadata during initial cache writes

**Files:**

- Modify: `packages/sdk/src/relayer/public-params-cache.ts`

Currently, `#loadPublicKey` and `#loadPublicParams` store only `publicKeyId`/`publicKey` and `publicParamsId`/`publicParams`. We need them to also store `lastValidatedAt: Date.now()`. The `artifactUrl`, `etag`, and `lastModified` are populated by revalidation — they start as `undefined` on first cache write (we don't have access to the HTTP response headers from the worker's internal fetch).

**Step 1: Add `lastValidatedAt` to the initial cache write in `#loadPublicKey`**

In the persist block of `#loadPublicKey`, change the cached object:

```ts
const cached: CachedPublicKey = {
  publicKeyId: result.publicKeyId,
  publicKey: toBase64(result.publicKey),
  lastValidatedAt: Date.now(),
};
```

**Step 2: Same for `#loadPublicParams`**

```ts
const cached: CachedPublicParams = {
  publicParamsId: result.publicParamsId,
  publicParams: toBase64(result.publicParams),
  lastValidatedAt: Date.now(),
};
```

**Step 3: Run all tests**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/public-params-cache.test.ts`
Expected: All PASS

**Step 4: Commit**

```
feat(sdk): persist lastValidatedAt on initial cache writes
```

---

### Task 5: Add `revalidateIntervalMs` config option

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-sdk.types.ts`
- Modify: `packages/sdk/src/relayer/relayer-node.ts`

**Step 1: Add to `RelayerWebConfig`**

In `packages/sdk/src/relayer/relayer-sdk.types.ts`, add to the `RelayerWebConfig` interface:

```ts
/** Revalidation interval in ms for cached FHE public material. Default: 86_400_000 (24h). Set to 0 to revalidate on every startup. Ignored when storage is not set. */
revalidateIntervalMs?: number;
```

**Step 2: Add to `RelayerNodeConfig`**

In `packages/sdk/src/relayer/relayer-node.ts`, add to the `RelayerNodeConfig` interface:

```ts
/** Revalidation interval in ms for cached FHE public material. Default: 86_400_000 (24h). Set to 0 to revalidate on every startup. Ignored when storage is not set. */
revalidateIntervalMs?: number;
```

**Step 3: Commit**

```
feat(sdk): add revalidateIntervalMs config option
```

---

### Task 6: Integrate revalidation into RelayerWeb and RelayerNode

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-web.ts`
- Modify: `packages/sdk/src/relayer/relayer-node.ts`

**Step 1: Add revalidation call to `RelayerWeb.#ensureWorkerInner()`**

After the cache creation block (line ~122) and before `if (!this.#initPromise)`, add:

```ts
// Revalidate cached artifacts if due
if (this.#cache && this.#initPromise) {
  const relayerUrl = mergeFhevmConfig(chainId, this.#config.transports[chainId]).relayerUrl;
  const interval = this.#config.revalidateIntervalMs ?? 86_400_000;
  const stale = await this.#cache.revalidateIfDue(relayerUrl, interval);
  if (stale) {
    this.#workerClient?.terminate();
    this.#workerClient = null;
    this.#initPromise = null;
    this.#cache = null; // force cache rebuild after re-init
  }
}
```

**Step 2: Add same to `RelayerNode.#ensurePoolInner()`**

After the cache creation block (line ~97) and before `if (!this.#initPromise)`, add:

```ts
// Revalidate cached artifacts if due
if (this.#cache && this.#initPromise) {
  const relayerUrl = mergeFhevmConfig(chainId, this.#config.transports[chainId]).relayerUrl;
  const interval = this.#config.revalidateIntervalMs ?? 86_400_000;
  const stale = await this.#cache.revalidateIfDue(relayerUrl, interval);
  if (stale) {
    this.#pool?.terminate();
    this.#pool = null;
    this.#initPromise = null;
    this.#cache = null;
  }
}
```

**Step 3: Run all existing tests**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/relayer.test.ts`
Expected: All PASS (revalidation only runs when `#initPromise` is set AND cache exists, so it won't trigger in tests that don't seed storage with expired timestamps)

**Step 4: Commit**

```
feat(sdk): integrate cache revalidation into RelayerWeb and RelayerNode
```

---

### Task 7: Add integration tests for worker teardown on stale

**Files:**

- Modify: `packages/sdk/src/relayer/__tests__/relayer.test.ts`

**Step 1: Add revalidation integration tests to `RelayerWeb` describe block**

```ts
describe("cache revalidation", () => {
  it("tears down worker when revalidation detects stale artifacts", async () => {
    const storage = new MemoryStorage();
    const relayer = createWebRelayer({
      storage,
      revalidateIntervalMs: 0, // always revalidate
    });

    // First call — init worker, cache public key
    const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1, 2]) };
    mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });
    await relayer.getPublicKey();

    // Simulate stale cache by mocking fetch to return changed ETag
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("/keyurl")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            fhePublicKey: { dataId: "id1", urls: ["https://cdn.example.com/pk.bin"] },
            crs: {},
          }),
        } as Response;
      }
      // HEAD on artifact — return different ETag
      return {
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"new-etag"' }),
        json: async () => ({}),
      } as Response;
    });

    // Second call triggers revalidation → stale → worker torn down → re-init
    resetMocks();
    mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });
    await relayer.getPublicKey();

    // Worker should have been torn down and re-created
    expect(mockWorkerClient.terminate).toHaveBeenCalled();
    expect(RelayerWorkerClient).toHaveBeenCalledTimes(2);

    globalThis.fetch = originalFetch;
  });

  it("does not tear down worker when artifacts are fresh", async () => {
    const storage = new MemoryStorage();
    const relayer = createWebRelayer({
      storage,
      revalidateIntervalMs: 86_400_000,
    });

    const pk = { publicKeyId: "id1", publicKey: new Uint8Array([1, 2]) };
    mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });
    await relayer.getPublicKey();

    // Second call — interval not elapsed, no revalidation
    await relayer.getPublicKey();

    expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);
    expect(mockWorkerClient.terminate).not.toHaveBeenCalled();
  });
});
```

**Step 2: Add same tests for `RelayerNode` describe block**

Mirror the two tests above but using `createNodeRelayer`, `mockPool`, and `NodeWorkerPool` instead.

**Step 3: Run all tests**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/relayer.test.ts`
Expected: All PASS

**Step 4: Commit**

```
test(sdk): add integration tests for cache revalidation teardown
```

---

### Task 8: Update API reports

**Files:**

- Modify: `packages/sdk/etc/sdk.api.md`
- Modify: `packages/sdk/etc/sdk-node.api.md`

**Step 1: Rebuild the API reports**

Run: `pnpm --filter @zama-fhe/sdk build`
This regenerates the `.api.md` files via API Extractor.

**Step 2: Verify changes are limited to the new config field**

Run: `git diff packages/sdk/etc/`
Expected: Only the `revalidateIntervalMs` addition in both `RelayerWebConfig` and `RelayerNodeConfig`

**Step 3: Commit**

```
docs: update API reports with revalidateIntervalMs config
```

---

### Task 9: Run full test suite and verify coverage

**Step 1: Run all tests with coverage**

Run: `pnpm vitest run --coverage`
Expected: All tests PASS, coverage meets 80% thresholds

**Step 2: Verify no TypeScript errors**

Run: `pnpm --filter @zama-fhe/sdk tsc --noEmit`
Expected: No errors

**Step 3: Final commit if any fixups needed**

```
chore: fix any coverage or type issues
```
