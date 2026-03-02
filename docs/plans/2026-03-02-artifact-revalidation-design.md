# Artifact-Level Revalidation for FHE Public Material Cache

**Date:** 2026-03-02
**Issue:** [SDK-7](https://linear.app/zama/issue/SDK-7/improve-usability-by-storing-public-key-and-params)
**Status:** Approved

## Problem

PR #33 added persistent caching for `getPublicKey()` and `getPublicParams()`, eliminating repeated large downloads across app restarts. However, cached artifacts can go stale indefinitely after key rotation since there is no revalidation mechanism.

## Goal

Add lightweight, periodic, artifact-level revalidation so the SDK refreshes cached FHE public key and CRS only when the underlying material has actually changed.

## Architecture

Revalidation is added to `PublicParamsCache` and triggered from `RelayerWeb`/`RelayerNode` during worker/pool initialization.

```
#ensureWorkerInner()
  -> cache.revalidateIfDue(relayerUrl, intervalMs)
     -> now - lastValidatedAt < interval? -> skip (no network)
     -> fetch /v2/keyurl manifest
     -> for each cached artifact: conditional HTTP to artifact URL
     -> validators match? -> update lastValidatedAt
     -> validators differ? -> clear cache, return { stale: true }
  -> stale? -> teardown worker, clear #initPromise
  -> not stale? -> proceed normally
```

Revalidation only runs when a worker already exists (`#initPromise` is set). On cold start, the worker fetches fresh data directly — no wasted revalidation call.

## Cache Metadata Schema

Existing cached JSON shapes are extended with optional revalidation fields:

```ts
interface CachedPublicKey {
  publicKeyId: string;
  publicKey: string; // base64 Uint8Array
  artifactUrl?: string; // level-2 URL the artifact was downloaded from
  etag?: string; // ETag from artifact response
  lastModified?: string; // Last-Modified from artifact response
  lastValidatedAt?: number; // Date.now() at last revalidation
}

interface CachedPublicParams {
  publicParamsId: string;
  publicParams: string; // base64 Uint8Array
  artifactUrl?: string;
  etag?: string;
  lastModified?: string;
  lastValidatedAt?: number;
}
```

All new fields are optional for backwards compatibility. Existing entries without `lastValidatedAt` trigger revalidation on first access.

## Revalidation Algorithm

`PublicParamsCache.revalidateIfDue(relayerUrl, intervalMs)` returns `true` if cache was invalidated.

1. **Check timing** — read cached metadata for this chain. If all entries have `lastValidatedAt` within `intervalMs`, return `false`. No network calls.

2. **Fetch manifest** — `GET {relayerUrl}/keyurl` -> extract `fhePublicKey.urls[0]` and `crs[bits].urls[0]`.

3. **For each cached artifact:**
   - URL changed -> stale
   - `publicKeyId`/`publicParamsId` changed -> stale (fast-path, no HTTP)
   - Otherwise, conditional request:
     - Cached `etag` exists -> `HEAD {artifactUrl}` with `If-None-Match`
     - Cached `lastModified` exists -> `HEAD {artifactUrl}` with `If-Modified-Since`
     - Neither -> `HEAD {artifactUrl}`, compare returned validators
   - 304 or matching validators -> fresh
   - Different validators -> stale

4. **Any artifact stale** -> clear all cache entries for this chain (memory + storage), return `true`

5. **All fresh** -> update `lastValidatedAt` on all entries, return `false`

6. **Network error** -> fail-open: update `lastValidatedAt` to avoid retry storm, return `false`

All artifacts are cleared together on any single staleness detection, since key rotation likely affects both public key and CRS.

## Config Changes

```ts
interface RelayerWebConfig {
  // ... existing fields ...
  storage?: GenericStringStorage;
  revalidateIntervalMs?: number; // default: 86_400_000 (24h), 0 = every time
}

interface RelayerNodeConfig {
  // ... existing fields ...
  storage?: GenericStringStorage;
  revalidateIntervalMs?: number;
}
```

Flat field on config (not nested) to match existing style. Ignored when `storage` is not set.

## Integration Points

In `RelayerWeb.#ensureWorkerInner()` and `RelayerNode.#ensurePoolInner()`, after cache creation and before returning `#initPromise`:

```ts
if (this.#cache && this.#initPromise) {
  const relayerUrl = mergeFhevmConfig(chainId, this.#config.transports[chainId]).relayerUrl;
  const interval = this.#config.revalidateIntervalMs ?? 86_400_000;
  const stale = await this.#cache.revalidateIfDue(relayerUrl, interval);
  if (stale) {
    this.#workerClient?.terminate();
    this.#workerClient = null;
    this.#initPromise = null;
  }
}
```

### CSRF and Proxy

- Manifest fetch (`/keyurl`) includes CSRF token when available (Web only, via `security.getCsrfToken`)
- Artifact HEAD requests target CDN URLs — no CSRF needed
- Proxy setups work naturally since `relayerUrl` already points to the proxy

## Testing Strategy

Unit tests against `PublicParamsCache` with mocked `fetch`:

1. Cache hit, interval not due -> no fetch calls
2. Due revalidation, 304 response -> cached bytes reused, `lastValidatedAt` updated
3. Due revalidation, ETag changed -> cache cleared, returns `true`
4. Due revalidation, Last-Modified changed -> cache cleared, returns `true`
5. Manifest URL/ID change -> cache cleared without artifact HEAD
6. Revalidation network error -> fail-open, cached bytes preserved
7. Chain switch isolation -> chain A revalidation doesn't affect chain B

Integration tests in `RelayerWeb`/`RelayerNode` verifying worker teardown on stale detection.

## Files to Modify

| File                                                   | Change                                             |
| ------------------------------------------------------ | -------------------------------------------------- |
| `packages/sdk/src/relayer/public-params-cache.ts`      | Add metadata fields, `revalidateIfDue()` method    |
| `packages/sdk/src/relayer/relayer-web.ts`              | Call `revalidateIfDue()` in `#ensureWorkerInner()` |
| `packages/sdk/src/relayer/relayer-node.ts`             | Call `revalidateIfDue()` in `#ensurePoolInner()`   |
| `packages/sdk/src/relayer/relayer-sdk.types.ts`        | Add `revalidateIntervalMs` to `RelayerWebConfig`   |
| `packages/sdk/src/relayer/relayer-node.ts`             | Add `revalidateIntervalMs` to `RelayerNodeConfig`  |
| `packages/sdk/src/relayer/public-params-cache.test.ts` | New test file with 7+ test cases                   |

## Out of Scope

- Fail-closed on transient errors (remains fail-open)
- Changes to relayer API schema
- Removing PR #33 caching logic
- S3-specific headers (uses generic HTTP validators only)
