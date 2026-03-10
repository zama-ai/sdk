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

## Usage

{% tabs %}
{% tab title="server.ts" %}

```ts
import { RelayerNode } from "@zama-fhe/sdk/node";
import { SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
    },
  },
});
```

{% endtab %}
{% tab title="sdk.ts" %}

```ts
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage,
});
```

{% endtab %}
{% endtabs %}

## Constructor

### getChainId

`() => Promise<number>`

Called lazily to determine which transport to use. The relayer initializes (or re-initializes) its thread pool when the chain changes.

```ts
const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
});
```

### transports

`Record<number, TransportConfig>`

Per-chain configuration. Each entry maps a chain ID to its network RPC and authentication. Use built-in presets (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`) and add your `network` and `auth`.

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
    },
  },
});
```

Each transport entry accepts:

| Field        | Type         | Description                                             |
| ------------ | ------------ | ------------------------------------------------------- |
| `network`    | `string`     | RPC URL for the chain.                                  |
| `auth`       | `AuthConfig` | API key or bearer token for the relayer.                |
| `relayerUrl` | `string`     | Custom relayer endpoint (overrides preset).             |
| `...preset`  | —            | Spread a preset to get contract addresses and defaults. |

Auth types:

```ts
// API key in header
auth: { __type: "ApiKeyHeader", value: "your-api-key" }

// API key in cookie
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Bearer token
auth: { __type: "BearerToken", token: "your-bearer-token" }
```

---

### poolSize

`number | undefined`

Number of native worker threads for FHE operations. Default: `Math.min(os.cpus().length, 4)`.

```ts
const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  transports: {
    /* ... */
  },
  poolSize: 8,
});
```

{% hint style="info" %}
The default of `min(CPU cores, 4)` works well for most server deployments. Increase for high-throughput services; decrease for memory-constrained environments.
{% endhint %}

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — pass the relayer to the SDK constructor
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser variant using Web Workers and WASM
- [Configuration guide](/guides/configuration) — authentication and network presets
