---
title: FheArtifactCache
description: Persistent cache for FHE public key and public parameters, avoiding re-downloads across sessions.
---

# FheArtifactCache

Persistent cache for the FHE network public key and public parameters (CRS). Stores large binary artifacts in a `GenericStorage` backend (e.g. IndexedDB) so they are not re-downloaded on every page load. Cache keys are scoped by chain ID.

`web()` and `node()` relayer transports create an `FheArtifactCache` internally — you configure it through the `fheArtifactStorage` and `fheArtifactCacheTTL` options on the transport factory.

{% hint style="info" %}
**`web()`** defaults to IndexedDB — artifact caching persists across page reloads.
**`node()`** defaults to `MemoryStorage` — artifacts are cached in-process but lost on restart. Pass a custom `GenericStorage` for cross-restart persistence.
{% endhint %}

## Import

```ts
import { FheArtifactCache } from "@zama-fhe/sdk";
```

## Usage

In most cases you don't instantiate `FheArtifactCache` directly. Instead, configure artifact caching through the relayer transport factory:

{% tabs %}
{% tab title="Default (IndexedDB)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

// web() uses IndexedDB artifact cache by default — no config needed
const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: web(),
  },
});
```

{% endtab %}
{% tab title="Custom storage" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web, IndexedDBStorage } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: web({
      // Custom IndexedDB database name
      fheArtifactStorage: new IndexedDBStorage("MyAppArtifacts", 1, "fhe"),
      // Revalidate every 12 hours instead of the default 24h
      fheArtifactCacheTTL: 43_200,
    }),
  },
});
```

{% endtab %}
{% tab title="node() (default)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

// node() defaults to MemoryStorage — artifacts are cached in-process
const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: node({ poolSize: 4 }),
  },
});
```

{% hint style="info" %}
The default `MemoryStorage` caches artifacts for the lifetime of the process but does **not** survive restarts. For cross-restart persistence, pass any `GenericStorage`-compatible backend (e.g. Redis, filesystem adapter). Pass `fheArtifactStorage: null` to disable caching entirely.
{% endhint %}

{% endtab %}
{% tab title="Direct instantiation" %}

```ts
import { FheArtifactCache } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

const cache = new FheArtifactCache({
  storage: myStorage,
  chainId: sepolia.id,
  relayerUrl: sepolia.relayerUrl,
  ttl: 86_400,
});

// Fetch public key (with cache-through)
const pk = await cache.getPublicKey(async () => {
  // Your network fetcher — called only on cache miss
  return { publicKeyId: "abc", publicKey: new Uint8Array([...]) };
});

// Fetch public parameters for a specific bit size
const params = await cache.getPublicParams(2048, async () => {
  return { publicParamsId: "def", publicParams: new Uint8Array([...]) };
});

// Check if cached artifacts are still fresh
const invalidated = await cache.revalidateIfDue();
if (invalidated) {
  // Re-fetch artifacts — cache was cleared
}
```

{% endtab %}
{% endtabs %}

## Constructor

```ts
new FheArtifactCache(opts);
```

| Field        | Type                         | Description                                                                                     |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `storage`    | `GenericStorage`             | Persistent key-value backend (e.g. `IndexedDBStorage`, `MemoryStorage`).                        |
| `chainId`    | `number`                     | Chain ID to scope cache keys.                                                                   |
| `relayerUrl` | `string`                     | Relayer URL used to fetch the manifest during revalidation.                                     |
| `ttl`        | `number \| undefined`        | Cache TTL in **seconds**. Default: `86400` (24 h). Set to `0` to revalidate on every operation. |
| `logger`     | `GenericLogger \| undefined` | Logger instance. Default: `console`.                                                            |

## Methods

### getPublicKey

```ts
cache.getPublicKey(fetcher): Promise<PublicKeyResult>
```

Returns the cached FHE public key, calling `fetcher` only on a cache miss. Concurrent calls are deduplicated. The result is memoized in memory and persisted to storage as base64.

**Parameters:**

| Name      | Type                             | Description                                                                        |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| `fetcher` | `() => Promise<PublicKeyResult>` | Called when no cached value exists. Return `{ publicKeyId, publicKey }` or `null`. |

**Returns:** `Promise<{ publicKeyId: string; publicKey: Uint8Array } | null>`

---

### getPublicParams

```ts
cache.getPublicParams(bits, fetcher): Promise<PublicParamsResult>
```

Returns the cached CRS (public parameters) for a given bit size, calling `fetcher` only on a cache miss. Concurrent calls for the same bit size are deduplicated.

**Parameters:**

| Name      | Type                                | Description                                                                              |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `bits`    | `number`                            | Bit size of the CRS to fetch (e.g. `2048`).                                              |
| `fetcher` | `() => Promise<PublicParamsResult>` | Called when no cached value exists. Return `{ publicParamsId, publicParams }` or `null`. |

**Returns:** `Promise<{ publicParamsId: string; publicParams: Uint8Array } | null>`

---

### revalidateIfDue

```ts
cache.revalidateIfDue(): Promise<boolean>
```

Checks whether cached artifacts are still fresh by issuing HTTP conditional requests (`ETag` / `If-None-Match`, `Last-Modified` / `If-Modified-Since`) against the artifact CDN URLs discovered from the relayer manifest.

- Returns `true` if the cache was invalidated (caller should re-fetch).
- Returns `false` if artifacts are still fresh or revalidation is not yet due.

Concurrent calls are coalesced. On transient failures (network errors, 5xx), the cache fails open and retries after 5 minutes.

## Relayer config options

When using `web()` or `node()` transport factories, configure artifact caching with these options:

### fheArtifactStorage

`GenericStorage | undefined`

Persistent storage backend for caching FHE artifacts.

- **`web()`**: defaults to `new IndexedDBStorage("FheArtifactCache", 1, "artifacts")` — caching is enabled automatically.
- **`node()`**: defaults to `new MemoryStorage()` — in-process caching.

FHE public parameters can be several MB — avoid `localStorage`-backed storage which caps at ~5 MB.

{% hint style="warning" %}
**Not to be confused with `ZamaProvider.storage`** which stores credentials and decrypted balances.
{% endhint %}

### fheArtifactCacheTTL

`number | undefined`

Cache TTL in **seconds**. Default: `86400` (24 h). Set to `0` to revalidate on every operation. Ignored when `fheArtifactStorage` is not set.

## How it works

1. **First load** — The SDK fetches the public key and CRS from the relayer, stores them as base64 in the configured storage backend, and caches them in memory.
2. **Subsequent loads** — The SDK reads from storage (instant), skipping the multi-MB network download.
3. **Revalidation** — Periodically (controlled by `ttl`), the cache issues `HEAD` requests with conditional headers to the artifact CDN. If the server returns 405 (Method Not Allowed), the cache falls back to a `GET` request. If artifacts haven't changed (304), only timestamps are updated. If they have changed (200), the entire cache is cleared and artifacts are re-fetched on next use.
4. **Fail-open** — On network errors or malformed manifests, the cache continues serving stale data and retries revalidation after 5 minutes.

## Storage keys

Cache entries are scoped by chain ID:

| Key pattern                   | Content                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `fhe:pubkey:{chainId}`        | Public key (base64 + metadata)                          |
| `fhe:params:{chainId}:{bits}` | Public parameters for a given bit size                  |
| `fhe:params-index:{chainId}`  | Array of cached bit sizes (for cold-start revalidation) |

## Related

- [RelayerWeb](/reference/sdk/RelayerWeb) — browser relayer that creates an `FheArtifactCache` internally
- [RelayerNode](/reference/sdk/RelayerNode) — Node.js relayer variant
- [GenericStorage](/reference/sdk/GenericStorage) — storage interface used by the cache
- [Configuration guide](/guides/configuration) — network presets and relayer setup
