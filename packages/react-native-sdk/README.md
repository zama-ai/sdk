# @zama-fhe/react-native-sdk

React Native (Expo) bindings for the [Zama confidential token SDK](https://github.com/zama-ai/sdk). Drop-in native FHE relayer plus Expo-backed storage adapters so every hook from `@zama-fhe/react-sdk` works on iOS and Android.

## Install

```sh
npx expo install @zama-fhe/react-native-sdk \
  @zama-fhe/sdk @zama-fhe/react-sdk \
  @tanstack/react-query \
  expo-crypto expo-secure-store expo-sqlite
```

Requires an Expo custom dev client (`npx expo prebuild`) or EAS Build — the package ships native Rust modules.

## Quickstart

```ts
// index.ts — must be the FIRST import
import "@zama-fhe/react-native-sdk/polyfills";
```

```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RelayerNative,
  SecureStoreAdapter,
  SqliteKvStoreAdapter,
} from "@zama-fhe/react-native-sdk";
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
        storage={new SecureStoreAdapter()}
        sessionStorage={new SqliteKvStoreAdapter()}
      >
        <Home />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

Every hook (`useEncrypt`, `useUserDecrypt`, `useShield`, …) from `@zama-fhe/react-sdk` now works.

## Exports

| Export                  | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `RelayerNative`         | Native `RelayerSDK` — same lifecycle as `RelayerWeb`.            |
| `RelayerNativeConfig`   | Config type — mirrors `RelayerWebConfig`.                        |
| `SecureStoreAdapter`    | `GenericStorage` for the durable `storage` slot (Keychain).      |
| `SqliteKvStoreAdapter`  | `GenericStorage` for the ephemeral `sessionStorage` slot (SQLite). |
| `/polyfills`            | Side-effect import: `crypto.getRandomValues`, `toSorted`, `isSubsetOf`. |

## Documentation

- [React Native guide](https://docs.zama.ai/sdk/guides/react-native) — full setup: polyfills, Metro for pnpm, custom dev client, `crypto.subtle` notes.
- [`RelayerNative` API reference](https://docs.zama.ai/sdk/reference/sdk/RelayerNative)
- [Smoke test app](../../test/test-react-native) — runnable Expo app exercising every public surface against live Sepolia.

## License

BSD-3-Clause-Clear © Zama
