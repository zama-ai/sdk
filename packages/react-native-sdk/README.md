# @zama-fhe/react-native-sdk

React Native bindings for the Zama confidential token SDK. Provides a native
FHE relayer (backed by the Rust `@fhevm/react-native-sdk` engine) and Expo-based
storage adapters so the React hooks from `@zama-fhe/react-sdk` work out of the
box in an Expo / React Native app.

> **Status:** alpha. iOS + Android are supported via Expo native modules. Expo
> Go is supported for client-side flows; SDK paths that require WebCrypto
> `subtle` (credential encryption) need a custom dev client — see
> [Polyfills](#polyfills).

---

## Install

```sh
npx expo install @zama-fhe/react-native-sdk \
  @zama-fhe/sdk @zama-fhe/react-sdk \
  @tanstack/react-query \
  expo-crypto expo-secure-store expo-sqlite
```

Peer-dependency matrix:

| Peer | Required version |
| --- | --- |
| `react`              | `>=18.0.0` |
| `react-native`       | `>=0.76.0` |
| `expo`               | `>=52.0.0` |
| `@zama-fhe/sdk`      | `^2.4.0-alpha.4` |
| `@zama-fhe/react-sdk`| `^2.4.0-alpha.4` |
| `@tanstack/react-query` | `>=5` |
| `expo-secure-store`  | `>=14.0.0` |
| `expo-sqlite`        | `>=15.0.0` |
| `expo-crypto`        | `>=14.0.0` (optional, only used by the polyfills entrypoint) |

The SDK ships native Rust code via Expo modules; you must use a
**custom Expo dev client** (`npx expo prebuild` + `npx expo run:ios|android`)
or **EAS Build**. Expo Go can run client-side flows that don't need
`crypto.subtle`.

---

## Quickstart

### 1. Install polyfills before any SDK code runs

React Native's Hermes engine is missing a few APIs the SDK depends on
(`crypto.getRandomValues`, `Array.prototype.toSorted`, `Set.prototype.isSubsetOf`).
Import the polyfills entrypoint **as the very first import** in your app's
entry file — Hermes hoists ES `import` statements above top-level code, so
this must be `import 1`, not `import N`.

```ts
// index.ts (Expo entry file)
import "@zama-fhe/react-native-sdk/polyfills"; // ← must be first

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
```

### 2. Wire `ZamaProvider` at the root

`RelayerNative` mirrors `RelayerWeb`'s constructor shape so a web → native
port is a one-line swap. Pass per-chain `transports` and a `getChainId`
resolver — the relayer re-initializes automatically when the chain changes.

```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RelayerNative,
  SecureStoreAdapter,
  SqliteKvStoreAdapter,
} from "@zama-fhe/react-native-sdk";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { SepoliaConfig, type GenericSigner } from "@zama-fhe/sdk";

const queryClient = new QueryClient();
const relayer = new RelayerNative({
  transports: { [SepoliaConfig.chainId]: SepoliaConfig },
  getChainId: async () => SepoliaConfig.chainId,
});
const storage = new SecureStoreAdapter();        // durable: keys, credentials
const sessionStorage = new SqliteKvStoreAdapter(); // ephemeral: caches, handles

// Plug your wallet here. Common options: WalletConnect, Privy, Reown.
const signer: GenericSigner = /* … */;

export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        signer={signer}
        storage={storage}
        sessionStorage={sessionStorage}
      >
        <App />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

### 3. Use the hooks from `@zama-fhe/react-sdk`

All hooks (`useEncrypt`, `useUserDecrypt`, `usePublicKey`,
`useTokenBalance`, …) work exactly like in the web SDK; the React Native
package only swaps out the relayer and storage adapters.

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

---

## API surface

This package re-exports a small number of platform-specific primitives. Every
hook, query, and mutation lives in `@zama-fhe/react-sdk`.

| Export                  | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `RelayerNative`         | `RelayerSDK` implementation backed by the native Rust engine.  |
| `RelayerNativeConfig`   | Type — mirrors `RelayerWebConfig` (minus `security` / `threads`). |
| `SecureStoreAdapter`    | `GenericStorage` backed by iOS Keychain / Android Keystore.    |
| `SqliteKvStoreAdapter`  | `GenericStorage` backed by `expo-sqlite/kv-store`.             |

Network presets (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`,
`DefaultConfigs`) come from `@zama-fhe/sdk`.

### `RelayerNative`

```ts
import { RelayerNative } from "@zama-fhe/react-native-sdk";
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerNative({
  transports: {
    [SepoliaConfig.chainId]: SepoliaConfig,
    [MainnetConfig.chainId]: MainnetConfig,
  },
  getChainId: async () => connectedChainId,
  // Optional:
  logger: console,
  onStatusChange: (status, error) => { /* track init */ },
  fheArtifactStorage: new SqliteKvStoreAdapter(), // default
  fheArtifactCacheTTL: 86_400,                    // 24 h, default
});
```

Lifecycle and behavior — identical to `RelayerWeb`:

- Lazily initializes the native FHE instance on first use.
- Serializes concurrent init attempts (`#initPromise` + `#ensureLock`).
- Retries init on failure — a transient network blip while bootstrapping
  doesn't brick the relayer for the rest of the session.
- **Chain switching:** re-resolves `getChainId()` before every operation
  and tears down + re-initializes when it changes.
- **Status tracking:** `relayer.status` is `"idle" | "initializing" | "ready" | "error"`;
  `relayer.initError` exposes the wrapped failure; `onStatusChange` fires on every
  transition.
- **Retries** transient network errors on `encrypt`, `userDecrypt`,
  `publicDecrypt`, `delegatedUserDecrypt`, `requestZKProofVerification` (exponential backoff).
- **Persistent artifact cache:** `getPublicKey` / `getPublicParams` are
  cached via `fheArtifactStorage` and revalidated based on `fheArtifactCacheTTL`.
- **Disposable:** `terminate()` clears state; `[Symbol.dispose]` lets you use
  `using relayer = new RelayerNative(...)`. The next public-method call
  transparently re-initializes — safe from `useEffect` cleanups and StrictMode
  unmount/remount cycles.

### `SecureStoreAdapter` — durable `storage` slot

Use this for the **`storage`** prop of `ZamaProvider`. Backed by
`expo-secure-store` (iOS Keychain / Android Keystore). Intended for
long-lived secrets such as user-decryption credentials.

Limits:
- Keys must match `[A-Za-z0-9._-]+`. The adapter prefixes keys with
  `zama_fhe_`; choose short alphanumeric keys upstream.
- iOS soft-limits entries to ~2 KB. Larger blobs work but degrade
  performance — keep big payloads in `SqliteKvStoreAdapter` and store only
  the small encryption key in SecureStore.

### `SqliteKvStoreAdapter` — ephemeral `sessionStorage` slot

Use this for the **`sessionStorage`** prop of `ZamaProvider`. Backed by
`expo-sqlite/kv-store` (an AsyncStorage-compatible KV layered on SQLite).
Intended for caches and short-lived per-session data (balance caches,
decryption handles, etc.). Keys are prefixed with `@zama-fhe:` to avoid
collisions with other libraries sharing the database.

---

## Polyfills

`@zama-fhe/react-native-sdk/polyfills` is a side-effect import that installs:

- `crypto.getRandomValues` — via `expo-crypto` (Expo Go compatible).
- `Array.prototype.toSorted` (ES2023).
- `Set.prototype.isSubsetOf` (ES2025).

**Not** polyfilled here: `crypto.subtle` (WebCrypto SubtleCrypto). The only
production-grade option is
[`react-native-quick-crypto`](https://github.com/margelo/react-native-quick-crypto),
which ships native modules that Expo Go cannot load. SDK paths that depend on
`crypto.subtle` (credential encryption used by `useUserDecrypt`) require a
**custom dev client**:

```sh
npx expo install react-native-quick-crypto
npx expo prebuild
```

```ts
// index.ts — install BEFORE importing the polyfills entrypoint
import { install } from "react-native-quick-crypto";
install();
import "@zama-fhe/react-native-sdk/polyfills";
// … rest of your entry
```

If you only need encryption (`useEncrypt`), public reads, or balance
queries, plain Expo Go works — `subtle` is not required.

---

## Metro / pnpm gotchas

If you use this SDK from a pnpm workspace, Metro must resolve a **single
copy** of `react`, `react-native`, and `@tanstack/react-query` across the
whole tree, otherwise you'll hit `Invalid hook call` at runtime. Pin them
in `metro.config.cjs`:

```js
// metro.config.cjs
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

A working reference setup lives in [`test/test-react-native`](../../test/test-react-native).

---

## Smoke-testing

The repo ships a runnable Expo app under `test/test-react-native` that
exercises every public surface of this package against live Sepolia:
storage adapters, polyfills, RPC reachability, the relayer bridge, RNG,
and `useEncrypt` across multiple ciphertext widths.

```sh
cd test/test-react-native
pnpm install
npx expo prebuild
npx expo run:ios     # or: npx expo run:android
```

Tap each row to run that test in isolation; green = OK, red = failure
with the error string surfaced inline.

---

## License

BSD-3-Clause-Clear © Zama
