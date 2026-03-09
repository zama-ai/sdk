---
title: GenericStorage
description: Interface for async key-value storage used to persist FHE keypairs and session signatures.
---

# GenericStorage

Interface for async key-value storage used to persist FHE keypairs and session signatures. The SDK ships with four built-in implementations -- you only need this interface if building a custom backend.

## Import

```ts
import type { GenericStorage } from "@zama-fhe/sdk";
```

## Definition

```ts
interface GenericStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

## Usage

```ts
import type { GenericStorage } from "@zama-fhe/sdk";

const redisStorage: GenericStorage = {
  async get(key) {
    return redis.get(key);
  },
  async set(key, value) {
    await redis.set(key, value);
  },
  async delete(key) {
    await redis.del(key);
  },
};

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: redisStorage, // [!code focus]
});
```

## Methods

### get

```ts
get(key: string): Promise<string | null>
```

Retrieve a value by key. Return `null` if the key does not exist.

### set

```ts
set(key: string, value: string): Promise<void>
```

Store a value under the given key. Overwrites any existing value.

### delete

```ts
delete(key: string): Promise<void>
```

Remove a key and its value. No-op if the key does not exist.

## Built-in implementations

### indexedDBStorage

```ts
import { indexedDBStorage } from "@zama-fhe/sdk";
```

Browser-based persistent storage backed by IndexedDB. Survives page reloads and browser restarts. Use this as the primary `storage` in browser apps.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage, // [!code focus]
});
```

### memoryStorage

```ts
import { memoryStorage } from "@zama-fhe/sdk";
```

In-memory storage cleared when the process exits. Suitable for tests and throwaway scripts.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage, // [!code focus]
});
```

### asyncLocalStorage

```ts
import { asyncLocalStorage } from "@zama-fhe/sdk/node";
```

Node.js per-request storage using [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html). Isolates FHE keypairs across concurrent requests on a server.

```ts
import { asyncLocalStorage } from "@zama-fhe/sdk/node"; // [!code focus]

app.post("/api/transfer", (req, res) => {
  asyncLocalStorage.run(async () => {
    const sdk = new ZamaSDK({ relayer, signer, storage: asyncLocalStorage });
    await sdk.createToken("0x...").confidentialTransfer("0x...", 100n);
  });
});
```

### chromeSessionStorage

```ts
import { chromeSessionStorage } from "@zama-fhe/sdk";
```

MV3 web extension storage backed by `chrome.storage.session`. Survives service worker restarts and is shared across popup, background, and content script contexts. Cleared when the browser closes.

Pass as `sessionStorage` (not `storage`) to persist wallet signatures across service worker restarts:

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
  sessionStorage: chromeSessionStorage, // [!code focus]
});
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) -- accepts `storage` and `sessionStorage` parameters
- [Configuration guide](/guides/configuration) -- storage selection guidance
