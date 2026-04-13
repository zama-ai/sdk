---
title: RelayerNative
description: React Native relayer that runs FHE operations natively via Expo modules.
---

# RelayerNative

React Native relayer that performs FHE encryption, decryption, and keypair management through native iOS/Android modules. Drop-in replacement for `RelayerWeb` — same `RelayerSDK` interface, same lifecycle, same configuration shape.

Ships in the dedicated package `@zama-fhe/react-native-sdk` (not in `@zama-fhe/sdk`) because it depends on Expo native modules.

## Import

```ts
import { RelayerNative } from "@zama-fhe/react-native-sdk";
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="app.tsx" %}

```ts
import { RelayerNative, SqliteKvStoreAdapter } from "@zama-fhe/react-native-sdk";
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

{% endtab %}
{% tab title="provider.tsx" %}

```tsx
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { SecureStoreAdapter, SqliteKvStoreAdapter } from "@zama-fhe/react-native-sdk";

<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={new SecureStoreAdapter()}        // durable: keys, credentials
  sessionStorage={new SqliteKvStoreAdapter()} // ephemeral: caches, handles
>
  <App />
</ZamaProvider>;
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
Before any SDK code runs, install the Hermes polyfills once at the top of your entry file:

```ts
import "@zama-fhe/react-native-sdk/polyfills";
```

See the [React Native guide](/guides/react-native) for the full setup.
{% endhint %}

## Constructor

### getChainId

`() => Promise<number>`

Called lazily before every operation to determine which transport to use. The relayer re-initializes its native instance when the chain changes, mirroring `RelayerWeb`'s behavior.

```ts
const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: { /* ... */ },
});
```

### transports

`Record<number, Partial<FhevmInstanceConfig>>`

Per-chain configuration. Each entry maps a chain ID to its network RPC, relayer URL, and optional preset fields. Use built-in presets (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`) and override what you need.

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

Each transport entry accepts:

| Field        | Type     | Description                                             |
| ------------ | -------- | ------------------------------------------------------- |
| `network`    | `string` | RPC URL for the chain.                                  |
| `relayerUrl` | `string` | Your backend proxy URL for the relayer API.             |
| `...preset`  | —        | Spread a preset to get contract addresses and defaults. |

### logger

`GenericLogger | undefined`

Optional logger for observing relayer lifecycle and request timing. Defaults to silent.

```ts
const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: { /* ... */ },
  logger: console,
});
```

### onStatusChange

`(status: RelayerSDKStatus, error?: Error) => void`

Called whenever the SDK transitions between `"idle"`, `"initializing"`, `"ready"`, and `"error"`. Useful for surfacing init progress or wiring telemetry.

```ts
const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: { /* ... */ },
  onStatusChange: (status, error) => {
    if (status === "error") reportSentry(error);
  },
});
```

### fheArtifactStorage

`GenericStorage | undefined`

Persistent storage for caching the FHE network public key and public params across app launches. Defaults to a fresh `SqliteKvStoreAdapter`.

FHE public params can reach several megabytes — keep this on a SQLite-backed store, never on `SecureStoreAdapter` (iOS Keychain caps entries at ~2 KB).

```ts
const relayer = new RelayerNative({
  getChainId: () => signer.getChainId(),
  transports: { /* ... */ },
  fheArtifactStorage: new SqliteKvStoreAdapter(), // default
});
```

{% hint style="warning" %}
Do not pass `ZamaProvider`'s `storage` prop here — that one is for credentials. They are separate caches.
{% endhint %}

### fheArtifactCacheTTL

`number | undefined`

Cache TTL in **seconds** for the FHE public material. Default: `86_400` (24 hours). Set to `0` to revalidate on every operation. Ignored when `fheArtifactStorage` is unset.

## Properties

### status

`RelayerSDKStatus`

Current native instance initialization status: `"idle" | "initializing" | "ready" | "error"`.

### initError

`Error | undefined`

The error that caused initialization to fail, if `status === "error"`. Wrapped in a `ConfigurationError`.

## Methods

The full `RelayerSDK` surface is implemented and behaves identically to `RelayerWeb`:

| Method                              | Behavior                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `generateKeypair()`                 | Native RNG → hex keypair.                                                 |
| `createEIP712(...)`                 | EIP-712 typed data for user-decrypt authorization.                        |
| `encrypt(params)`                   | Builds an `EncryptedInput`, retried on transient network errors.          |
| `userDecrypt(params)`               | User-bound decryption, retried on transient errors.                       |
| `publicDecrypt(handles)`            | Public decryption with no signature, retried on transient errors.         |
| `createDelegatedUserDecryptEIP712`  | EIP-712 typed data for delegated decryption.                              |
| `delegatedUserDecrypt(params)`      | Decryption via delegation, retried on transient errors.                   |
| `requestZKProofVerification(proof)` | Submit a ZK proof to the relayer, retried on transient errors.            |
| `getPublicKey()`                    | TFHE compact public key — cached via `fheArtifactStorage`.                |
| `getPublicParams(bits)`             | Public parameters for `bits`-bit encryption — cached.                     |
| `getAclAddress()`                   | ACL contract address from the merged transport config.                    |
| `terminate()`                       | Clear cached state. Next public-method call transparently re-initializes. |
| `[Symbol.dispose]()`                | Alias for `terminate()`. Use with `using relayer = …`.                    |

## Lifecycle

`RelayerNative` mirrors `RelayerWeb`'s lifecycle exactly:

1. **Lazy init** — the native FHE instance is built on first use, never at construction.
2. **Concurrent-init lock** — multiple parallel callers share a single `createInstance()` promise.
3. **Chain switching** — when `getChainId()` returns a value different from the previously-resolved chain, the old instance is torn down and a fresh one is built for the new chain.
4. **Auto-restart after `terminate()`** — calling `terminate()` clears state but does not permanently brick the relayer; the next public-method call re-initializes. Safe under React StrictMode and HMR.
5. **Retries on transient errors** — `encrypt`, `userDecrypt`, `publicDecrypt`, `delegatedUserDecrypt`, and `requestZKProofVerification` retry on network blips with exponential backoff.
6. **Persistent artifact cache** — `getPublicKey` / `getPublicParams` are cached via `fheArtifactStorage` and revalidated based on `fheArtifactCacheTTL`.

## Related

- [React Native guide](/guides/react-native) — full setup walkthrough
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser variant with identical API shape
- [FheArtifactCache](/reference/sdk/FheArtifactCache) — internals of the public-key cache
- [Network Presets](/reference/sdk/network-presets) — `SepoliaConfig`, `MainnetConfig`, `HardhatConfig`, `DefaultConfigs`
