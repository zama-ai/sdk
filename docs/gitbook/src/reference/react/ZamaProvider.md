---
title: ZamaProvider
description: Context provider that supplies the Zama SDK to all descendant hooks.
---

# ZamaProvider

Context provider that supplies the Zama SDK to all descendant hooks. Wrap your application (or the subtree that uses confidential tokens) with this component.

## Import

```ts
import { ZamaProvider } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="wagmi setup" %}

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY") },
});

const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <YourApp />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

{% endtab %}
{% tab title="viem setup" %}

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
        <YourApp />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

{% endtab %}
{% endtabs %}

## Props

```ts
import { type ZamaProviderProps } from "@zama-fhe/react-sdk";
```

### relayer

`RelayerWeb | RelayerNode`

Relayer instance that submits encrypted transactions on the user's behalf.

### signer

`WagmiSigner | ViemSigner | EthersSigner | GenericSigner`

Signer that provides wallet connectivity for signing FHE keypair authorizations and transactions.

### storage

`GenericStorage`

Persistent storage backend for encrypted FHE keypairs and cached balances. Use `indexedDBStorage` for browsers or `memoryStorage` for tests.

---

### sessionStorage

`GenericStorage | undefined`

Storage backend for wallet session signatures. Defaults to in-memory storage. Pass `chromeSessionStorage` for web extensions so signatures survive service worker restarts.

### keypairTTL

`number | undefined`

FHE keypair lifetime in seconds. After expiry a fresh keypair is generated and the wallet prompts again. Default: `86400` (1 day).

### sessionTTL

`number | undefined`

Session signature lifetime in seconds. After expiry the user re-signs once to unlock their existing FHE keypair. Default: `2592000` (30 days).

### onEvent

`ZamaSDKEventListener | undefined`

Callback fired for SDK lifecycle events (keypair generation, signing, encryption, decryption). Useful for analytics and debugging.

## Related

- [Configuration guide](/guides/configuration)
- [Session Model](/concepts/session-model)
