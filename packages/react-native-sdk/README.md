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
| `RelayerNative`        | Native `RelayerSDK` — same lifecycle as `RelayerWeb`.              |
| `RelayerNativeConfig`  | Config type — mirrors `RelayerWebConfig`.                          |
| `SqliteKvStoreAdapter` | `GenericStorage` backed by `expo-sqlite/kv-store`. Use for both `storage` and `sessionStorage`. |
| `/polyfills`           | Side-effect import: `crypto.subtle`, `crypto.getRandomValues`, `Array.toSorted`, `Set.isSubsetOf`. Must be the first import in your entry file. |

## Documentation

- [React Native guide](https://docs.zama.ai/sdk/guides/react-native) — full setup: polyfills, Metro for pnpm, custom dev client, `crypto.subtle` notes.
- [`RelayerNative` API reference](https://docs.zama.ai/sdk/reference/sdk/RelayerNative)
- [Smoke test app](../../test/test-react-native) — runnable Expo app exercising every public surface against live Sepolia.

## License

BSD-3-Clause-Clear © Zama
