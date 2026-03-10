---
title: Configuration
description: How to set up the SDK's three required pieces — relayer, signer, and storage.
---

# Configuration

Every SDK instance needs a relayer (handles FHE encryption and decryption), a signer (wallet interface), and a storage backend (persists the FHE keypair). This guide walks through each piece and assembles a working `ZamaSDK`.

## Steps

### 1. Choose your environment

The SDK ships two relayer implementations. Pick the one that matches your runtime:

| Environment                 | Relayer       | Import path                              |
| --------------------------- | ------------- | ---------------------------------------- |
| Browser (React, vanilla TS) | `RelayerWeb`  | `@zama-fhe/sdk` or `@zama-fhe/react-sdk` |
| Node.js (scripts, servers)  | `RelayerNode` | `@zama-fhe/sdk/node`                     |

`RelayerWeb` runs FHE inside a Web Worker using WASM. `RelayerNode` uses native worker threads.

{% hint style="info" %}
For local Hardhat nodes or custom testnets deployed in cleartext mode, use [`RelayerCleartext`](/guides/local-development) instead — no KMS, no gateway, no WASM needed.
{% endhint %}

### 2. Set up a signer

The signer lets the SDK interact with the user's wallet. Choose the adapter for your Web3 library.

{% tabs %}
{% tab title="viem" %}

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const signer = new ViemSigner({ walletClient, publicClient });
```

{% endtab %}
{% tab title="ethers" %}

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// Browser — pass the raw EIP-1193 provider
const signer = new EthersSigner({ ethereum: window.ethereum! });

// Node.js — pass an ethers Signer directly
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// const signer = new EthersSigner({ signer: new ethers.Wallet(privateKey, provider) });
```

{% endtab %}
{% tab title="wagmi (React)" %}

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
```

{% endtab %}
{% endtabs %}

For full type information, see the [ViemSigner](/reference/sdk/ViemSigner), [EthersSigner](/reference/sdk/EthersSigner), and [WagmiSigner](/reference/sdk/WagmiSigner) reference pages. You can also implement the [GenericSigner](/reference/sdk/GenericSigner) interface for a custom wallet integration.

### 3. Configure the relayer

The relayer needs a `getChainId` callback and a transport map. Use the built-in [network presets](/reference/sdk/network-presets) (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`) so you don't have to specify contract addresses manually. Each preset provides `chainId`, `relayerUrl`, `gatewayAddress`, `aclAddress`, and `kmsVerifierAddress` for its network.

{% tabs %}
{% tab title="Browser (RelayerWeb)" %}

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
{% tab title="Node.js (RelayerNode)" %}

```ts
import { SepoliaConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  poolSize: 4, // worker threads (defaults to min(CPU cores, 4))
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
{% endtabs %}

Browser apps should proxy relayer requests through a backend to keep the API key secret. See the [Authentication guide](/guides/authentication) for the full setup.

For details on multi-threaded FHE and security options, see the [RelayerWeb](/reference/sdk/RelayerWeb) and [RelayerNode](/reference/sdk/RelayerNode) reference pages.

### 4. Choose a storage backend

The FHE keypair is cached so users don't get a wallet popup on every decrypt. Pick the storage that fits your environment:

| Storage             | When to use                                         |
| ------------------- | --------------------------------------------------- |
| `indexedDBStorage`  | Browser apps — persists across reloads and sessions |
| `memoryStorage`     | Tests, scripts, throwaway sessions                  |
| `asyncLocalStorage` | Node.js servers — isolates FHE keypair per request  |

```ts
import { indexedDBStorage, memoryStorage } from "@zama-fhe/sdk";
// Node.js per-request isolation:
// import { asyncLocalStorage } from "@zama-fhe/sdk/node";
```

For full storage options including `chromeSessionStorage` for MV3 extensions, see the [GenericStorage](/reference/sdk/GenericStorage) reference.

### 5. Create the SDK instance

With the three pieces ready, assemble the SDK:

{% tabs %}
{% tab title="Browser (viem)" %}

```ts
import { ZamaSDK, RelayerWeb, indexedDBStorage, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [SepoliaConfig.chainId]: {
        ...SepoliaConfig,
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% tab title="Node.js" %}

```ts
import { ZamaSDK, memoryStorage, SepoliaConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    transports: {
      [SepoliaConfig.chainId]: {
        ...SepoliaConfig,
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
      },
    },
  }),
  signer,
  storage: memoryStorage,
});
```

{% endtab %}
{% endtabs %}

### 6. (Optional) Configure TTLs and event listener

You can tune how long the FHE keypair and session signatures remain valid, and subscribe to lifecycle events for debugging:

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  keypairTTL: 604800, // 7 days (default: 86400 = 1 day)
  sessionTTL: 3600, // 1 hour (default: 2592000 = 30 days)
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

Setting `sessionTTL: 0` disables session caching entirely — every operation triggers a wallet prompt. When done with the SDK, call `sdk.terminate()` to clean up the Web Worker or thread pool.

## Next steps

- [Authentication](/guides/authentication) — set up a backend proxy or use a direct API key
- [Shield Tokens](/guides/shield-tokens) — convert public ERC-20 tokens into confidential form
- [RelayerWeb reference](/reference/sdk/RelayerWeb) — multi-threading, security options, CDN configuration
- [GenericStorage reference](/reference/sdk/GenericStorage) — custom storage implementations
