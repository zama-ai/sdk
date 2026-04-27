---
title: Configuration
description: How to configure the SDK with createConfig — chains, relayers, signer, and storage.
---

# Configuration

The SDK uses `createConfig` to wire together chains, relayers, a signer, and storage into a single configuration object. This guide walks through each piece.

## Steps

### 1. Pick your chains

Import pre-configured chain objects from `@zama-fhe/sdk/chains`. Each chain includes contract addresses, relayer URLs, and chain IDs.

```ts
import { sepolia, mainnet, hoodi } from "@zama-fhe/sdk/chains";
```

| Chain     | Chain ID   | Description        |
| --------- | ---------- | ------------------ |
| `mainnet` | `1`        | Ethereum Mainnet   |
| `sepolia` | `11155111` | Sepolia Testnet    |
| `hoodi`   | `17000`    | Hoodi Testnet      |
| `hardhat` | `31337`    | Local Hardhat node |

### 2. Pick a relayer

Relayers tell the SDK how to run FHE operations on each chain.

| Relayer       | Environment | Description                                  |
| ------------- | ----------- | -------------------------------------------- |
| `web()`       | Browser     | Runs WASM in a Web Worker via CDN            |
| `node()`      | Node.js     | Uses native worker threads                   |
| `cleartext()` | Local dev   | No FHE infrastructure — cleartext operations |

```ts
import { web, cleartext } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
```

Chain-specific data (`relayerUrl`, `network`, `executorAddress`, etc.) comes from the chain preset. The relayer factory only accepts pool/worker options.

```ts
// Browser — uses relayerUrl from the chain preset
web();

// Node.js — pool options only; chain data comes from the preset
node({ poolSize: 4 });

// Local dev — no KMS, no gateway; executorAddress comes from the chain preset
cleartext();
```

If you need to override a chain field (e.g. proxy relayer requests through your backend), spread the preset in the `chains` array:

```ts
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;
```

### 3. Set up a signer

The signer lets the SDK interact with the user's wallet. Choose the adapter for your Web3 library.

{% tabs %}
{% tab title="wagmi (React)" %}

```ts
// Signer is derived automatically from wagmiConfig — no manual setup needed.
```

{% endtab %}
{% tab title="viem" %}

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});
```

{% endtab %}
{% tab title="ethers" %}

```ts
// Browser — pass the raw EIP-1193 provider
// const ethersConfig = { ethereum: window.ethereum! };

// Node.js — pass an ethers Signer directly
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// const ethersConfig = { signer: new ethers.Wallet(privateKey, provider) };
```

{% endtab %}
{% endtabs %}

For full type information, see the [ViemSigner](/reference/sdk/ViemSigner), [EthersSigner](/reference/sdk/EthersSigner), and [WagmiSigner](/reference/sdk/WagmiSigner) reference pages. You can also implement the [GenericSigner](/reference/sdk/GenericSigner) interface for a custom wallet integration.

### 4. Create the config

`createConfig` takes your chains, relayers, and signer adapter and returns a config object.

{% tabs %}
{% tab title="React + wagmi" %}

```tsx
import { web } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

// Override relayerUrl to proxy through your backend
const mySepolia = { ...sepolia, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;
const myMainnet = { ...mainnet, relayerUrl: "https://your-app.com/api/relayer/1" } as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia, myMainnet],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
    [myMainnet.id]: web(),
  },
});
```

{% endtab %}
{% tab title="Browser (viem)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;
const myMainnet = { ...mainnet, relayerUrl: "https://your-app.com/api/relayer/1" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  publicClient,
  walletClient,
  relayers: {
    [mySepolia.id]: web(),
    [myMainnet.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Browser (ethers)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/ethers";
import { web, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  ethereum: window.ethereum!,
  relayers: {
    [mySepolia.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Node.js" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, network: "https://sepolia.infura.io/v3/YOUR_KEY" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  storage: memoryStorage,
  relayers: {
    [mySepolia.id]: node({ poolSize: 4 }),
  },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Web Extensions" %}

MV3 Chrome extensions need a second storage backend for session signatures, because the service worker can be terminated at any time and in-memory state is lost. Use `chromeSessionStorage` alongside `indexedDBStorage`:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web, ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = { ...sepolia, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  storage: indexedDBStorage,
  sessionStorage: chromeSessionStorage,
  relayers: {
    [mySepolia.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

Your `manifest.json` must include the `"storage"` permission. See the [Web Extensions guide](/guides/web-extensions) for manifest configuration, multi-context sharing, and browser close behavior.

{% endtab %}
{% endtabs %}

Browser apps should proxy relayer requests through a backend to keep the API key secret. See the [Authentication guide](/guides/authentication) for the full setup.

### 5. (Optional) Configure TTLs and event listener

You can tune how long the FHE keypair and session signatures remain valid, and subscribe to lifecycle events for debugging:

```ts
const config = createConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
  keypairTTL: 604800, // 7 days (default: 2592000 = 30 days)
  sessionTTL: 3600, // 1 hour (default: 2592000 = 30 days)
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

Setting `sessionTTL: 0` disables session caching entirely — every operation triggers a wallet prompt. When done with the SDK, call `sdk.terminate()` to clean up the Web Worker or thread pool.

### 6. (Optional) Choose a storage backend

The FHE keypair is cached so users don't get a wallet popup on every decrypt. By default, `createConfig` picks the right storage for your environment. Override with the `storage` field if needed:

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

For full storage options see the [GenericStorage](/reference/sdk/GenericStorage) reference.

## Shared relayer options

When multiple chains use the same relayer type, pass a shared options object to reuse a single relayer instance:

```ts
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const sharedOpts = { threads: 8, logger: console };

const mySepolia = { ...sepolia, relayerUrl: "/api/relayer/11155111" } as const satisfies FheChain;
const myMainnet = { ...mainnet, relayerUrl: "/api/relayer/1" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  publicClient,
  walletClient,
  relayers: {
    [mySepolia.id]: web(sharedOpts),
    [myMainnet.id]: web(sharedOpts),
  },
});
```

Chains that pass the _same_ `options` object (by reference) share a single relayer instance, reducing memory usage.

## Next steps

- [Authentication](/guides/authentication) — set up a backend proxy or use a direct API key
- [Shield Tokens](/guides/shield-tokens) — convert public ERC-20 tokens into confidential form
- [Chain Objects](/reference/sdk/network-presets) — pre-configured chain definitions for Sepolia, Mainnet, and more
- [GenericStorage reference](/reference/sdk/GenericStorage) — custom storage implementations
