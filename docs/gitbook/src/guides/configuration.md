---
title: Configuration
description: How to configure the SDK with createConfig — chains, relayers, provider, signer, and storage.
---

# Configuration

The SDK uses `createConfig` to wire together chains, relayers, a provider, an optional signer, and storage into a single configuration object. This guide walks through each piece.

## Steps

### 1. Pick your chains

Import pre-configured chain objects from `@zama-fhe/sdk/chains`. Each chain includes contract addresses, relayer URLs, and chain IDs.

```ts
import { sepolia, mainnet, hoodi } from "@zama-fhe/sdk/chains";
```

| Chain          | Chain ID   | Description             |
| -------------- | ---------- | ----------------------- |
| `mainnet`      | `1`        | Ethereum Mainnet        |
| `sepolia`      | `11155111` | Sepolia Testnet         |
| `polygonAmoy`  | `80002`    | Polygon Amoy Testnet    |
| `hoodi`        | `560048`   | Hoodi Testnet           |
| `ingenTestnet` | `364301`   | InGen Testnet           |
| `bscTestnet`   | `97`       | BNB Smart Chain Testnet |
| `hardhat`      | `31337`    | Local Hardhat node      |

`anvil` is also exported as an alias for `hardhat` (both target chain ID `31337`), for Foundry users.

{% hint style="info" %}
The shared Zama testnet relayer needs **no API key**: presets like `sepolia` and `polygonAmoy` work as-is, so leave `auth` unset. Only the Zama-hosted **mainnet** relayer requires a key; see [Authentication](authentication.md).
{% endhint %}

### 2. Pick a relayer

Relayers tell the SDK how to run FHE operations on each chain.

| Relayer       | Environment | Description                                  |
| ------------- | ----------- | -------------------------------------------- |
| `web()`       | Browser     | Runs FHE via bundled WASM in the browser     |
| `node()`      | Node.js     | Same FHE runtime, server-side                |
| `cleartext()` | Local dev   | No FHE infrastructure — cleartext operations |

```ts
import { cleartext } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { node } from "@zama-fhe/sdk/node";
```

Chain-specific data (`relayerUrl`, `network`, `executorAddress`, etc.) comes from the chain preset, so a bare call is all most apps need. Each factory also accepts an optional options object forwarded to `@fhevm/sdk` for per-client tuning (e.g. `batchRpcCalls`, `fheEncryptionKey`).

```ts
// Browser — uses relayerUrl from the chain preset
web();

// Node.js — chain data comes from the preset
node();

// Local dev — no KMS, no gateway; executorAddress comes from the chain preset
cleartext();
```

If you need to override a chain field (e.g. proxy relayer requests through your backend), spread the preset in the `chains` array:

```ts
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;
```

### 3. Set up chain access

The SDK separates read access (provider) from wallet authority (signer). The provider handles contract reads and receipt polling. The signer handles signing and write transactions. Both are created automatically by `createConfig` — you pass your Web3 library's native objects.

{% tabs %}
{% tab title="wagmi (React)" %}

```tsx
// createConfig from @zama-fhe/react-sdk/wagmi accepts your wagmiConfig directly — see step 4 below.
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
const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });
```

{% endtab %}
{% tab title="ethers" %}

```ts
// Browser — pass the raw EIP-1193 provider
// createConfig({ ..., ethereum: window.ethereum! })

// Node.js — pass an ethers Signer (provider is extracted automatically)
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// createConfig({ ..., signer: new ethers.Wallet(privateKey, provider) })
```

{% endtab %}
{% endtabs %}

For full type information, see the [ViemProvider](../reference/sdk/ViemProvider.md) / [ViemSigner](../reference/sdk/ViemSigner.md) and [EthersProvider](../reference/sdk/EthersProvider.md) / [EthersSigner](../reference/sdk/EthersSigner.md) reference pages. You can also implement [GenericProvider](../reference/sdk/GenericProvider.md) and [GenericSigner](../reference/sdk/GenericSigner.md) for a custom integration.

### 4. Create the config

`createConfig` takes your chains, relayers, and signer adapter and returns a config object.

{% tabs %}
{% tab title="React + wagmi" %}

```tsx
import { web } from "@zama-fhe/sdk/web";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

// Override relayerUrl to proxy through your backend
const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;
const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia, myMainnet],
  wagmiConfig,
  relayers: { [mySepolia.id]: web(), [myMainnet.id]: web() },
});
```

{% endtab %}
{% tab title="Browser (viem)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;
const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  publicClient,
  walletClient,
  relayers: { [mySepolia.id]: web(), [myMainnet.id]: web() },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Browser (ethers)" %}

```ts
import { createConfig } from "@zama-fhe/sdk/ethers";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  ethereum: window.ethereum!,
  relayers: { [mySepolia.id]: web() },
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

const mySepolia = {
  ...sepolia,
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  storage: memoryStorage,
  relayers: { [mySepolia.id]: node() },
});

const sdk = new ZamaSDK(config);
```

{% endtab %}
{% tab title="Custom signer/provider" %}

When the built-in adapters don't fit your setup — for example, a server-side relayer that implements `GenericSigner` directly — use the generic `createConfig` from `@zama-fhe/sdk`:

```ts
import { createConfig, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia],
  signer: myCustomSigner, // implements GenericSigner
  provider: myCustomProvider, // implements GenericProvider
  storage: memoryStorage,
  relayers: { [mySepolia.id]: node() },
});

const sdk = new ZamaSDK(config);
```

See [GenericSigner](../reference/sdk/GenericSigner.md) and [GenericProvider](../reference/sdk/GenericProvider.md) for the interfaces your adapter must implement.

{% endtab %}
{% tab title="Web Extensions" %}

MV3 Chrome extensions can use `chromeSessionStorage` as `permitStorage` so permits survive service worker restarts:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK, indexedDBStorage, chromeSessionStorage } from "@zama-fhe/sdk";
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
  storage: indexedDBStorage,
  permitStorage: chromeSessionStorage,
  relayers: { [mySepolia.id]: web() },
});

const sdk = new ZamaSDK(config);
```

Your `manifest.json` must include the `"storage"` permission. See the [Web Extensions guide](./web-extensions.md) for manifest configuration, multi-context sharing, and browser close behavior.

{% endtab %}
{% endtabs %}

Browser apps should proxy relayer requests through a backend to keep the API key secret. See the [Authentication guide](./authentication.md) for the full setup.

### 5. (Optional) Configure TTLs and event listener

You can tune how long the transport key pair and permits remain valid, and subscribe to lifecycle events for debugging:

```ts
const config = createConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
  transportKeyPairTTL: 604800, // 7 days in seconds (default: 2592000 = 30 days)
  permitTTL: 7, // 7 days (default: 30 days)
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

When done with the SDK, call `sdk.terminate()` to unsubscribe wallet listeners and release the SDK's resources.

### 6. (Optional) Choose a storage backend

The transport key pair is cached so users don't get a wallet popup on every decrypt. By default, `createConfig` picks the right storage for your environment. Override with the `storage` field if needed:

| Storage             | When to use                                               |
| ------------------- | --------------------------------------------------------- |
| `indexedDBStorage`  | Browser apps — persists across reloads and sessions       |
| `memoryStorage`     | Tests, scripts, throwaway sessions                        |
| `asyncLocalStorage` | Node.js servers — isolates transport key pair per request |

```ts
import { indexedDBStorage, memoryStorage } from "@zama-fhe/sdk";
// Node.js per-request isolation:
// import { asyncLocalStorage } from "@zama-fhe/sdk/node";
```

For full storage options see the [GenericStorage](../reference/sdk/GenericStorage.md) reference.

### 7. (Optional) Supply a logger

The SDK is **silent by default** — it emits no console output of its own. Operation failures always surface through the rejected promise or typed error, never as a stray `console.error`. To observe internal diagnostics, pass a `logger` to `createConfig`:

```ts
const config = createConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
  logger: console, // or a pino / winston / OpenTelemetry DiagLogger instance
});
```

The `logger` is a minimal four-level interface — `error`, `warn`, `info`, `debug` — that `console` and common logging libraries satisfy directly, so no adapter is needed. The SDK never bundles a logging library or imposes a format; level filtering is left to your logger. Levels follow these conventions:

| Level   | What the SDK emits                                                                           |
| ------- | -------------------------------------------------------------------------------------------- |
| `error` | Unexpected internal failures only — never failures already surfaced via a rejection          |
| `warn`  | Recoverable or degraded conditions (a fallback path, a retry, a swallowed best-effort write) |
| `info`  | Reserved for coarse lifecycle milestones; not currently emitted                              |
| `debug` | Verbose diagnostics — relayer request timing, orchestration progress                         |

The logger is configured once here and flows SDK-wide — including into relayer request tracing, the credential store, and the decrypt cache. There is deliberately no per-relayer logger option; `createConfig({ logger })` is the single source of truth.

### 8. (Optional) Tune the FHE runtime

The `runtime` field configures the underlying `@fhevm/sdk` WASM runtime — threading, WASM asset loading, and module versions. It is process-global: it applies once per process, not per chain or per relayer.

```ts
const config = createConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
  runtime: {
    numberOfThreads: 4, // parallelise FHE work across Web Workers
  },
});
```

The knob most apps reach for is thread count:

| Field             | Effect                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `numberOfThreads` | Number of Web Workers used to parallelise FHE encryption/decryption |
| `singleThread`    | `true` forces a single thread — no `SharedArrayBuffer` required     |

{% hint style="warning" %}
Multi-threaded FHE relies on `SharedArrayBuffer`, which browsers only expose to [cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated) pages. To run more than one thread, serve your app with both headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If you can't set those headers (some static hosts and embedded contexts), pass `runtime: { singleThread: true }` instead — the SDK then runs FHE on the main thread with no `SharedArrayBuffer` dependency.
{% endhint %}

### 9. (Optional) Share one transport key pair across signers (B2B2C / WaaS)

By default, every signer gets its own transport key pair. Wallet-as-a-Service operators managing many end-user wallets from one operator-controlled key store can opt into sharing a single key pair across signers with `transportKeyPairScope`:

```ts
const config = createConfig({
  chains: [sepolia],
  wagmiConfig,
  relayers: { [sepolia.id]: web() },
  transportKeyPairScope: "tenant-123", // opaque identifier, e.g. your tenant ID
  storage: myPersistentStorage, // must be shared across every signer in this scope
});
```

Permits stay per-signer regardless of scope. See [Security Model](../concepts/security-model.md#shared-tenant-scope-b2b2c-waas-operators) for the tradeoff this makes, and [Permit Model](../concepts/permit-model.md#two-revocation-tiers-with-a-shared-scope) for how revocation splits into a signer-level tier (`revokePermits`/`clear`) and an operator-level one (`sdk.permits.revokeTransportKeyPair()`).

### 10. (Optional) Wrap the transport key pair at rest (headless environments)

By default, security for the persisted private key is delegated to your storage backend. In a headless context with no secure storage to delegate to — a CLI tool, an agent on bare metal, local dev — pass `transportKeyPairDerivationSecret` from your own environment instead:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const derivationSecret = process.env.ZAMA_DERIVATION_SECRET;
if (!derivationSecret) {
  throw new Error("ZAMA_DERIVATION_SECRET is not set — refusing to store the key pair unwrapped");
}

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: node() },
  transportKeyPairDerivationSecret: derivationSecret, // string | Uint8Array
});

const sdk = new ZamaSDK(config);
```

Validate the value explicitly rather than asserting it with `!`: an unset env var reaches `createConfig` as `undefined`, which silently disables wrapping and persists the private key in plaintext.

{% hint style="danger" %}
**Headless environments only.** Never put `transportKeyPairDerivationSecret` in a browser bundle. Bundlers inline `process.env` values at build time, so the secret ships to every visitor — and a secret every client already holds protects nothing. Browser apps should rely on the default (IndexedDB behind same-origin isolation and OS disk encryption).
{% endhint %}

{% hint style="warning" %}
Wrapping uses WebCrypto `crypto.subtle`, which is unavailable in non-secure contexts (plain `http://` on a LAN IP) and in React Native without a polyfill. Where it is missing, wrapping fails with [`KeyWrappingError`](../reference/sdk/errors.md#keywrappingerror).
{% endhint %}

The SDK never manages or stores this value. See [Security Model](../concepts/security-model.md#wrapped-at-rest-transportkeypairderivationsecret) for the exact mechanism (HKDF-SHA256 → AES-256-GCM), how changing the secret is handled (treated as a cache miss, not an error), and how it composes with `transportKeyPairScope`.

## Shared relayer options

When multiple chains use the same relayer, create it once and reference that single instance from each chain:

```ts
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const sharedWeb = web({ batchRpcCalls: true });

const mySepolia = { ...sepolia, relayerUrl: "/api/relayer/11155111" } as const satisfies FheChain;
const myMainnet = { ...mainnet, relayerUrl: "/api/relayer/1" } as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  publicClient,
  walletClient,
  relayers: { [mySepolia.id]: sharedWeb, [myMainnet.id]: sharedWeb },
});
```

Chains that reference the _same_ relayer object — the result of a single `web()` call — share one FHE backend instance, reducing memory usage.

## Next steps

- [Authentication](./authentication.md) — set up a backend proxy or use a direct API key
- [Shield Tokens](./shield-tokens.md) — convert public ERC-20 tokens into confidential form
- [Chain Objects](../reference/sdk/network-presets.md) — pre-configured chain definitions for Sepolia, Mainnet, and more
- [GenericStorage reference](../reference/sdk/GenericStorage.md) — custom storage implementations
