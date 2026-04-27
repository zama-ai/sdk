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
import { ZamaProvider, web } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY") },
});

const mySepolia = { ...sepoliaFhe, relayerUrl: "https://your-app.com/api/relayer/11155111", network: "https://sepolia.infura.io/v3/YOUR_KEY" } as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: {
    [mySepolia.id]: web(),
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
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
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, web } from "@zama-fhe/react-sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { sepolia as sepoliaFhe, type FheChain } from "@zama-fhe/sdk/chains";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const mySepolia = { ...sepoliaFhe, relayerUrl: "https://your-app.com/api/relayer/11155111" } as const satisfies FheChain;

const zamaConfig = createConfig({
  chains: [mySepolia],
  publicClient,
  walletClient,
  relayers: {
    [mySepolia.id]: web(),
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={zamaConfig}>
        <YourApp />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

{% endtab %}
{% tab title="cleartext (local dev)" %}

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, cleartext } from "@zama-fhe/react-sdk";
import { createConfig } from "@zama-fhe/sdk/viem";
import { hardhat } from "@zama-fhe/sdk/chains";

const zamaConfig = createConfig({
  chains: [hardhat],
  publicClient,
  walletClient,
  relayers: {
    [hardhat.id]: cleartext(),
  },
});
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={zamaConfig}>
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

### config

`ZamaConfig`

Configuration object created by [`createConfig`](/guides/configuration). Wires together chains, relayers, signer, and storage for the SDK.

## Related

- [Configuration guide](/guides/configuration)
- [Session Model](/concepts/session-model)
