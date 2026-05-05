---
title: Web extensions
description: How to use the SDK in MV3 Chrome extensions with persistent permit storage.
---

# Web extensions

MV3 Chrome extensions present a unique challenge: the background service worker can be terminated by Chrome at any time. When that happens, anything stored in JavaScript memory is lost -- including the SDK's default in-memory permit storage. This guide shows how to keep permits alive across service worker restarts.

## Steps

### 1. Understand the problem

By default, the SDK stores signed permits (used to authorize FHE decryption) in an in-memory JavaScript object. In a normal web page, that memory lives for the duration of the tab. In an MV3 extension, the service worker can shut down after 30 seconds of inactivity.

When the service worker restarts, the in-memory permits are gone. The user would need to re-sign with their wallet on every interaction -- a broken experience.

### 2. Use `chromeSessionStorage` for permit persistence

The SDK ships a `chromeSessionStorage` adapter that stores signed permits in `chrome.storage.session` instead of in-memory. This API is backed by Chrome's own persistence layer, not your JavaScript heap.

```ts
import { ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";
```

### 3. Configure the SDK with both storage backends

Pass `indexedDBStorage` for the FHE keypair (persistent, survives browser close) and `chromeSessionStorage` for permits (ephemeral, survives service worker restarts):

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  storage: indexedDBStorage, // encrypted keypair — persistent
  permitStorage: chromeSessionStorage, // signed permits — ephemeral
  relayers: { [mySepolia.id]: web() },
});
const sdk = new ZamaSDK(config);
```

{% tabs %}
{% tab title="manifest.json" %}

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "background": {
    "service_worker": "background.js"
  }
}
```

{% endtab %}
{% endtabs %}

The `"storage"` permission is required for `chrome.storage.session` access.

### 4. Benefits of this setup

With `chromeSessionStorage` in place, you get three things:

**Popup, background, and content script sharing** -- all extension contexts read from the same `chrome.storage.session` store. The user signs once in the popup, and the background script can decrypt balances without another prompt.

**Service worker restart survival** -- `chrome.storage.session` is not tied to JavaScript memory. When Chrome terminates and restarts the service worker, signed permits are still available.

**Automatic cleanup on browser close** -- Chrome purges `chrome.storage.session` when the browser closes. The user starts fresh on the next launch, which matches the expected security behavior for wallet-signed permits.

### 5. Browser close behavior

When the user closes Chrome entirely:

1. `chrome.storage.session` is cleared by the browser -- signed permits are gone
2. `indexedDB` persists -- the FHE keypair survives
3. On next launch, the user re-signs once to create fresh permits for their existing keypair

This mirrors the default browser SDK behavior (in-memory permits lost on tab close) but extends the permit lifetime to cover service worker restarts within the same browser session.

## Next steps

- [GenericStorage](/reference/sdk/GenericStorage) -- implement a custom storage adapter for other extension APIs
- [Permit Model](/concepts/permit-model) -- how the keypair vault, signed permits, and storage interact
