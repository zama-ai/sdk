---
title: RelayerWeb
description: Browser relayer that runs FHE operations in a Web Worker via WASM.
---

# RelayerWeb

Browser relayer that runs FHE operations in a Web Worker via WASM. Handles encryption, decryption, and keypair management for browser applications.

## Import

```ts
import { RelayerWeb } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

{% endtab %}
{% tab title="sdk.ts" %}

```ts
import { ZamaSDK, indexedDBStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% endtabs %}

## Constructor

### getChainId

`() => Promise<number>`

Called lazily to determine which transport to use. The relayer initializes (or re-initializes) its worker when the chain changes.

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
});
```

### transports

`Record<number, TransportConfig>`

Per-chain configuration. Each entry maps a chain ID to its network RPC, relayer URL, and optional preset fields. Use built-in presets (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`) and override what you need.

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
  },
});
```

Each transport entry accepts:

| Field        | Type         | Description                                             |
| ------------ | ------------ | ------------------------------------------------------- |
| `network`    | `string`     | RPC URL for the chain.                                  |
| `relayerUrl` | `string`     | Your backend proxy URL for the relayer API.             |
| `auth`       | `AuthConfig` | Direct API key auth (server-side only).                 |
| `...preset`  | —            | Spread a preset to get contract addresses and defaults. |

{% hint style="warning" %}
In browser apps, use `relayerUrl` to proxy through your backend. Never expose the API key client-side. Use `auth` only in server-side or prototype setups.
{% endhint %}

---

### threads

`number | undefined`

Number of threads for parallel FHE via `wasm-bindgen-rayon` and `SharedArrayBuffer`. Default: `1` (single-threaded). The practical sweet spot is 4-8 threads; beyond that, diminishing returns and higher memory usage.

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
  threads: Math.min(navigator.hardwareConcurrency, 8),
});
```

{% hint style="warning" %}
Multi-threading requires [COOP/COEP headers](https://web.dev/articles/coop-coep) for `SharedArrayBuffer` access:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, the browser blocks `SharedArrayBuffer` and the relayer falls back to single-threaded mode.
{% endhint %}

### security

`{ integrityCheck?: boolean; getCsrfToken?: () => string } | undefined`

Security options for the WASM bundle and relayer requests.

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
  security: {
    integrityCheck: true, // SHA-384 verification of WASM bundle (default: true)
    getCsrfToken: () => document.cookie.match(/csrf=(\w+)/)?.[1] ?? "",
  },
});
```

| Field            | Type           | Description                                         |
| ---------------- | -------------- | --------------------------------------------------- |
| `integrityCheck` | `boolean`      | Verify SHA-384 of the WASM bundle. Default: `true`. |
| `getCsrfToken`   | `() => string` | Returns a CSRF token to attach to relayer requests. |

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — pass the relayer to the SDK constructor
- [RelayerNode](/reference/sdk/RelayerNode) — Node.js variant using worker threads
- [Configuration guide](/guides/configuration) — authentication and network presets
