# @zama-fhe/react-native-sdk

React Native (Expo) bindings for the [Zama confidential token SDK](https://github.com/zama-ai/sdk). Drop-in native FHE relayer plus an Expo-backed storage adapter so every hook from `@zama-fhe/react-sdk` works on iOS and Android.

## Install

```sh
npx expo install @zama-fhe/react-native-sdk \
  @zama-fhe/sdk @zama-fhe/react-sdk \
  @tanstack/react-query \
  react-native-quick-crypto expo-sqlite
```

Requires an Expo custom dev client (`npx expo prebuild`) or EAS Build — the package ships native modules (FHE engine + `react-native-quick-crypto`).

## Quickstart

```ts
// index.ts — must be the FIRST import
import "@zama-fhe/react-native-sdk/polyfills";
```

```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerNative, SqliteKvStoreAdapter } from "@zama-fhe/react-native-sdk";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";

const queryClient = new QueryClient();
const relayer = new RelayerNative({
  transports: { [SepoliaConfig.chainId]: SepoliaConfig },
  getChainId: () => signer.getChainId(),
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        signer={signer}
        storage={new SqliteKvStoreAdapter()}
        sessionStorage={new SqliteKvStoreAdapter()}
      >
        <Home />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

Every hook from `@zama-fhe/react-sdk` now works (`useEncrypt`, `useUserDecrypt`, `useShield`, …).

## Exports

| Export                 | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `RelayerNative`        | Native `RelayerSDK` — same lifecycle as `RelayerWeb`. Exposes `.status` and `.initError` properties. |
| `RelayerNativeConfig`  | Config type — mirrors `RelayerWebConfig`.                          |
| `SqliteKvStoreAdapter` | `GenericStorage` backed by `expo-sqlite/kv-store`. Use for both `storage` and `sessionStorage`. |
| `/polyfills`           | Side-effect import: `crypto.subtle`, `crypto.getRandomValues`, `Array.toSorted`, `Set.isSubsetOf`. Must be the first import in your entry file. |

## Configuration

### `RelayerNativeConfig`

| Field | Type | Description |
| --- | --- | --- |
| `transports` | `Record<number, Partial<FhevmInstanceConfig>>` | Per-chain configs keyed by chain ID. Merged on top of `DefaultConfigs[chainId]`. |
| `getChainId` | `() => Promise<number>` | Resolve the current chain ID. Called lazily; the native instance is re-initialized on chain change. |
| `logger` | `GenericLogger` | Optional. Logger for lifecycle and request timing. |
| `onStatusChange` | `(status: RelayerSDKStatus, error?: Error) => void` | Optional. Called whenever the SDK status changes (idle -> initializing -> ready -> error). |
| `fheArtifactStorage` | `GenericStorage` | Optional. Persistent storage for caching FHE public key and params. Defaults to `SqliteKvStoreAdapter`. |
| `fheArtifactCacheTTL` | `number` | Optional. Cache TTL in seconds for FHE public material. Default: `86400` (24 hours). Set `0` to revalidate every operation. |

Fields intentionally absent vs `RelayerWebConfig`:
- `security` -- native modules don't load remote scripts; CSRF/CDN integrity doesn't apply.
- `threads` -- the native FHE engine manages its own thread pool internally.

## Documentation

- [React Native guide](https://docs.zama.ai/sdk/guides/react-native) — full setup: polyfills, Metro for pnpm, custom dev client, `crypto.subtle` notes.
- [`RelayerNative` API reference](https://docs.zama.ai/sdk/reference/sdk/RelayerNative)
- [Smoke test app](../../test/test-react-native) — runnable Expo app exercising every public surface against live Sepolia.

## License

BSD-3-Clause-Clear © Zama
