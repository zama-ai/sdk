---
title: React Native
description: How to use the Zama SDK in an Expo / React Native app — polyfills, native relayer, and storage adapters.
---

# React Native

The Zama SDK ships a dedicated React Native package, `@zama-fhe/react-native-sdk`, that provides:

- **`RelayerNative`** — a native-backed `RelayerSDK` implementation. Identical lifecycle and configuration shape as `RelayerWeb`, so a web → native port is a one-line constructor swap.
- **`SecureStoreAdapter`** — `GenericStorage` backed by iOS Keychain / Android Keystore. Use for the durable `storage` slot (encrypted credentials).
- **`SqliteKvStoreAdapter`** — `GenericStorage` backed by `expo-sqlite/kv-store`. Use for the ephemeral `sessionStorage` slot (caches, handles, FHE artifact cache).
- **`/polyfills` entrypoint** — installs the small set of JS APIs the SDK relies on but Hermes is missing.

All hooks (`useEncrypt`, `useUserDecrypt`, `useShield`, …) come from `@zama-fhe/react-sdk` and work unchanged.

{% hint style="warning" %}
The SDK ships native Rust code via Expo modules. You must use an **Expo custom dev client** (`npx expo prebuild` + `npx expo run:ios|android`) or **EAS Build**. Expo Go can run client-side flows that don't depend on `crypto.subtle`.
{% endhint %}

## Steps

### 1. Install dependencies

```sh
npx expo install \
  @zama-fhe/react-native-sdk \
  @zama-fhe/sdk \
  @zama-fhe/react-sdk \
  @tanstack/react-query \
  expo-crypto \
  expo-secure-store \
  expo-sqlite
```

Peer-dep matrix:

| Peer                    | Required version |
| ----------------------- | ---------------- |
| `react`                 | `>=18.0.0`       |
| `react-native`          | `>=0.76.0`       |
| `expo`                  | `>=52.0.0`       |
| `@zama-fhe/sdk`         | `^2.4.0-alpha.4` |
| `@zama-fhe/react-sdk`   | `^2.4.0-alpha.4` |
| `@tanstack/react-query` | `>=5`            |
| `expo-secure-store`     | `>=14.0.0`       |
| `expo-sqlite`           | `>=15.0.0`       |
| `expo-crypto`           | `>=14.0.0`       |

### 2. Install the polyfills before any SDK code runs

Hermes is missing `crypto.getRandomValues`, `Array.prototype.toSorted`, and `Set.prototype.isSubsetOf`. The polyfills entrypoint installs them on `globalThis`. It **must be the first import** in your entry file — Hermes hoists ES `import` statements above top-level code.

{% tabs %}
{% tab title="index.ts" %}

```ts
// Polyfill Web/JS APIs the SDK needs (must run before any SDK imports).
import "@zama-fhe/react-native-sdk/polyfills";

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
The polyfills entrypoint does **not** install `crypto.subtle`. SDK paths that depend on it (credential encryption used by `useUserDecrypt`) require [`react-native-quick-crypto`](https://github.com/margelo/react-native-quick-crypto), which only loads in a custom dev client:

```ts
// index.ts — install BEFORE the polyfills entrypoint
import { install } from "react-native-quick-crypto";
install();
import "@zama-fhe/react-native-sdk/polyfills";
```

If you only need encryption, public reads, and balance queries, plain Expo Go works.
{% endhint %}

### 3. Wire `ZamaProvider` at the root

`RelayerNative` takes the same `RelayerNativeConfig` shape as `RelayerWebConfig` — `transports` per chain ID and a `getChainId` resolver:

{% tabs %}
{% tab title="App.tsx" %}

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RelayerNative,
  SecureStoreAdapter,
  SqliteKvStoreAdapter,
} from "@zama-fhe/react-native-sdk";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { SepoliaConfig, type GenericSigner } from "@zama-fhe/sdk";

const queryClient = new QueryClient();

const signer: GenericSigner = /* WalletConnect / Privy / Reown / … */;

const relayer = new RelayerNative({
  transports: { [SepoliaConfig.chainId]: SepoliaConfig },
  getChainId: () => signer.getChainId(),
});

const storage = new SecureStoreAdapter();        // durable: keys, credentials
const sessionStorage = new SqliteKvStoreAdapter(); // ephemeral: caches, handles

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        signer={signer}
        storage={storage}
        sessionStorage={sessionStorage}
      >
        <Home />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

{% endtab %}
{% endtabs %}

### 4. Use the hooks normally

Every hook from `@zama-fhe/react-sdk` works unchanged — only the relayer and storage adapters differ from the web setup.

```tsx
import { useEncrypt, usePublicKey } from "@zama-fhe/react-sdk";

function EncryptDemo({ contract, user }) {
  const publicKey = usePublicKey();
  const encrypt = useEncrypt();

  async function onPress() {
    const result = await encrypt.mutateAsync({
      contractAddress: contract,
      userAddress: user,
      values: [
        { type: "euint64", value: 42n },
        { type: "ebool", value: true },
      ],
    });
    console.log(result.handles, result.inputProof);
  }

  if (publicKey.isLoading) return <Text>Loading FHE keys…</Text>;
  return <Button title="Encrypt" onPress={onPress} />;
}
```

### 5. Configure Metro for pnpm workspaces

If your project lives in a pnpm workspace, Metro must resolve a **single copy** of `react`, `react-native`, and `@tanstack/react-query` across the whole tree. Otherwise you'll hit `Invalid hook call` at runtime because hooks dispatch through a different React than the renderer.

{% tabs %}
{% tab title="metro.config.cjs" %}

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

const SINGLETONS = new Map([
  ["react", path.resolve(projectRoot, "node_modules/react")],
  ["react-native", path.resolve(projectRoot, "node_modules/react-native")],
  ["@tanstack/react-query", path.resolve(projectRoot, "node_modules/@tanstack/react-query")],
]);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, root] of SINGLETONS) {
    if (moduleName === name || moduleName.startsWith(`${name}/`)) {
      const subpath = moduleName.slice(name.length);
      return context.resolveRequest(context, `${root}${subpath}`, platform);
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
```

{% endtab %}
{% endtabs %}

## Storage slots: which adapter goes where?

`ZamaProvider` (and `ZamaSDK`) take two storage slots with different durability requirements:

| Prop             | Lifetime               | Recommended adapter      | Backed by                         |
| ---------------- | ---------------------- | ------------------------ | --------------------------------- |
| `storage`        | Durable (across launches) | `SecureStoreAdapter`     | iOS Keychain / Android Keystore   |
| `sessionStorage` | Ephemeral / per session   | `SqliteKvStoreAdapter`   | `expo-sqlite/kv-store`            |

`SecureStoreAdapter` limits:

- Keys must match `[A-Za-z0-9._-]+`. The adapter prefixes keys with `zama_fhe_`.
- iOS soft-limits entries to ~2 KB. Larger blobs work but degrade performance — keep big payloads in `SqliteKvStoreAdapter`.

## Lifecycle and chain switching

`RelayerNative` re-resolves `getChainId()` before every operation. When the chain changes:

1. The old native instance is discarded.
2. A fresh instance is created for the new chain (via `Object.assign({}, DefaultConfigs[chainId], transports[chainId])`).
3. The `FheArtifactCache` is rebuilt for the new chain — public-key bytes are scoped per chain ID.

The relayer also exposes `status` (`"idle" | "initializing" | "ready" | "error"`), `initError`, and an `onStatusChange` callback for surfacing init progress in your UI.

## Smoke testing

The repo ships a runnable Expo app under `test/test-react-native` that exercises every public surface of `@zama-fhe/react-native-sdk` against live Sepolia: storage adapters, polyfills, RPC reachability, the relayer bridge, RNG, and `useEncrypt` across multiple ciphertext widths.

```sh
cd test/test-react-native
pnpm install
npx expo prebuild
npx expo run:ios     # or: npx expo run:android
```

Tap each row to run that test in isolation.

## Related

- [RelayerNative](/reference/sdk/RelayerNative) — API reference
- [RelayerWeb](/reference/sdk/RelayerWeb) — browser variant with identical config shape
- [Configuration guide](/guides/configuration) — authentication and network presets
