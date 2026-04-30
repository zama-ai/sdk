---
title: RelayerNode
description: Node.js relayer that runs FHE operations in native worker threads.
---

# RelayerNode

Node.js relayer that runs FHE operations in native worker threads. The server-side counterpart to `RelayerWeb`.

## Import

```ts
import { RelayerNode } from "@zama-fhe/sdk/node";
```

{% hint style="info" %}
`RelayerNode` is exported from the `/node` sub-path, not the main entry point.
{% endhint %}

{% hint style="info" %}
For most applications, prefer the `node()` transport factory with `createConfig` instead of constructing `RelayerNode` directly. See [Network Presets](/reference/sdk/network-presets) for examples.
{% endhint %}

## Usage

{% tabs %}
{% tab title="Recommended (node transport)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
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
```

{% endtab %}
{% tab title="Direct construction" %}

```ts
import { RelayerNode } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const relayer = new RelayerNode({
  chain: {
    ...sepolia,
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
    auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
  },
  pool: nodeWorkerPool,
});
```

{% endtab %}
{% endtabs %}

## Constructor (`RelayerNodeConfig`)

### chain

`FheChain`

FHE chain configuration. Use a built-in chain preset (`sepolia`, `mainnet`, `hoodi`, `hardhat`) or a custom `FheChain` object. Include `auth` for relayer authentication.

### pool

`NodeWorkerPool`

Native worker thread pool for FHE operations.

### logger

`GenericLogger | undefined`

Optional logger for observing worker lifecycle and request timing.

### fheArtifactStorage

`GenericStorage | undefined`

Persistent storage for caching FHE public key and params.

### fheArtifactCacheTTL

`number | undefined`

How long cached FHE artifacts remain valid, in seconds.

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — pass the relayer to the SDK constructor
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser variant using Web Workers and WASM
- [Configuration guide](/guides/configuration) — authentication and network presets
