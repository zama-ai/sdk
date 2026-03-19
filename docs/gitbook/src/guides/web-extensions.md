---
title: Web Extensions
description: How to use the SDK in MV3 Chrome extensions with persistent session storage.
---

# Web Extensions

MV3 Chrome extensions present a unique challenge: the background service worker can be terminated by Chrome at any time. When that happens, anything stored in JavaScript memory is lost -- including the SDK's default in-memory session storage. This guide shows how to keep sessions alive across service worker restarts.

## Steps

### 1. Understand the problem

By default, the SDK stores the wallet signature (used to unlock the FHE keypair) in an in-memory JavaScript object. In a normal web page, that memory lives for the duration of the tab. In an MV3 extension, the service worker can shut down after 30 seconds of inactivity.

When the service worker restarts, the in-memory session is gone. The user would need to re-sign with their wallet on every interaction -- a broken experience.

### 2. Use `chromeSessionStorage` for session persistence

The SDK ships a `chromeSessionStorage` adapter that stores the wallet signature in `chrome.storage.session` instead of in-memory. This API is backed by Chrome's own persistence layer, not your JavaScript heap.

```ts
import { ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";
```

### 3. Configure the SDK with both storage backends

Pass `indexedDBStorage` for the encrypted FHE keypair (persistent, survives browser close) and `chromeSessionStorage` for the session signature (ephemeral, survives service worker restarts).

The relayer also needs `resolveAssetUrl` so the Web Worker and SDK assets are loaded from the extension bundle:

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
  resolveAssetUrl: (name) => chrome.runtime.getURL(name),
});

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage, // encrypted keypair — persistent
  sessionStorage: chromeSessionStorage, // wallet signature — ephemeral
});
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

**Service worker restart survival** -- `chrome.storage.session` is not tied to JavaScript memory. When Chrome terminates and restarts the service worker, the session signature is still available.

**Automatic cleanup on browser close** -- Chrome purges `chrome.storage.session` when the browser closes. The user starts fresh on the next launch, which matches the expected security behavior for wallet signatures.

### 5. Browser close behavior

When the user closes Chrome entirely:

1. `chrome.storage.session` is cleared by the browser -- the wallet signature is gone
2. `indexedDB` persists -- the encrypted FHE keypair survives
3. On next launch, the user re-signs once to unlock their existing keypair

This mirrors the default browser SDK behavior (in-memory session lost on tab close) but extends the session lifetime to cover service worker restarts within the same browser session.

## Next steps

- [GenericStorage](/reference/sdk/GenericStorage) -- implement a custom storage adapter for other extension APIs
- [Session Model](/concepts/session-model) -- how keypair encryption, session signatures, and storage interact
