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

{% hint style="info" %}
For most applications, prefer the `web()` transport factory with `createConfig` instead of constructing `RelayerWeb` directly. See [Network Presets](/reference/sdk/network-presets) for examples.
{% endhint %}

## Usage

{% tabs %}
{% tab title="Recommended (web transport)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

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
{% tab title="Direct construction" %}

```ts
import { RelayerWeb } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

const relayer = new RelayerWeb({
  chain: sepolia,
  worker: relayerWorkerClient,
});
```

{% endtab %}
{% endtabs %}

## Constructor (`RelayerWebConfig`)

### chain

`FheChain`

FHE chain configuration. Use a built-in chain preset (`sepolia`, `mainnet`, `hoodi`, `hardhat`) or a custom `FheChain` object.

### worker

`RelayerWorkerClient`

Worker client that handles WASM operations off the main thread.

### security

`RelayerWebSecurityConfig | undefined`

Security options for the WASM bundle and relayer requests.

| Field            | Type           | Description                                         |
| ---------------- | -------------- | --------------------------------------------------- |
| `integrityCheck` | `boolean`      | Verify SHA-384 of the WASM bundle. Default: `true`. |
| `getCsrfToken`   | `() => string` | Returns a CSRF token to attach to relayer requests. |

### logger

`GenericLogger | undefined`

Optional logger for observing worker lifecycle and request timing.

### threads

`number | undefined`

Number of WASM threads for parallel FHE operations inside the Web Worker. Default: `1` (single-threaded). The practical sweet spot is 4-8 threads; beyond that, diminishing returns and higher memory usage.

{% hint style="warning" %}
Multi-threading requires [COOP/COEP headers](https://web.dev/articles/coop-coep) for `SharedArrayBuffer` access:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, the browser blocks `SharedArrayBuffer` and the relayer falls back to single-threaded mode.
{% endhint %}

### fheArtifactStorage

`GenericStorage | undefined`

Persistent storage for caching FHE public key and params across sessions.

### fheArtifactCacheTTL

`number | undefined`

How long cached FHE artifacts remain valid, in seconds.

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — pass the relayer to the SDK constructor
- [RelayerNode](/reference/sdk/RelayerNode) — Node.js variant using worker threads
- [Configuration guide](/guides/configuration) — authentication and network presets
