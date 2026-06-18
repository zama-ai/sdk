---
title: RelayerNode
description: Node.js relayer that runs FHE operations in native worker threads.
---

# RelayerNode

Node.js relayer that runs FHE operations in native worker threads. The server-side counterpart to `RelayerWeb`.

{% hint style="warning" %}
`RelayerNode`, `NodeWorkerClient`, and `NodeWorkerPool` are internal classes — they are no longer exported from `@zama-fhe/sdk/node`. Use the `node()` transport factory with `createConfig` instead.
{% endhint %}

## Usage

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [{ ...sepolia, auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY } }],
  publicClient,
  walletClient,
  relayers: {
    [sepolia.id]: node({ poolSize: 4 }),
  },
});

const sdk = new ZamaSDK(config);
```

## `node()` options

### poolSize

`number | undefined`

Number of native worker threads. Default: `min(CPU cores, 4)`. Must be a positive integer.

### logger

`GenericLogger | undefined`

Optional logger for observing worker lifecycle and request timing.

### fheArtifactStorage

`GenericStorage | undefined`

Persistent storage for caching the FHE encryption key and params.

### fheArtifactCacheTTL

`number | undefined`

How long cached FHE artifacts remain valid, in seconds. Must be a non-negative integer.

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — pass the config to the SDK constructor
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser variant using Web Workers and WASM
- [Configuration guide](/guides/configuration) — authentication and network presets
