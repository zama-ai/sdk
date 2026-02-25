# Provider Setup

All setups use `ZamaProvider`. Create a signer with the adapter for your library, then pass it directly.

```tsx
import { ZamaProvider } from "@zama-fhe/react-sdk";

<ZamaProvider
  relayer={relayer} // RelayerSDK (RelayerWeb or RelayerNode instance)
  signer={signer} // GenericSigner (WagmiSigner, ViemSigner, EthersSigner, or custom)
  storage={storage} // GenericStringStorage
  credentialDurationDays={1} // Optional. Days FHE credentials remain valid. Default: 1. Set 0 for sign-every-time.
  onEvent={(event) => console.debug(event)} // Optional. Structured event listener for debugging.
>
  {children}
</ZamaProvider>;
```

## With wagmi

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http("https://mainnet.infura.io/v3/YOUR_KEY"),
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [sepolia.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <TokenBalance />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

## With a Custom Signer

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  RelayerWeb,
  useConfidentialBalance,
  useConfidentialTransfer,
  MemoryStorage,
} from "@zama-fhe/react-sdk";

const queryClient = new QueryClient();

const relayer = new RelayerWeb({
  getChainId: () => yourCustomSigner.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} signer={yourCustomSigner} storage={new MemoryStorage()}>
        <TransferForm />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
```

## SSR / Next.js

All components using SDK hooks must be client components. Add `"use client"` at the top of files that import from `@zama-fhe/react-sdk`. FHE operations (encryption, decryption) run in a Web Worker and require browser APIs -- they cannot execute on the server.

```tsx
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";
```

Place `ZamaProvider` inside your client-only layout. Do **not** create the relayer or signer at the module level in a server component -- wrap them in a client component or use lazy initialization.

## FHE Credentials Lifecycle

FHE decrypt credentials are generated once per wallet + token set and cached in the storage backend you provide (e.g. `IndexedDBStorage`). The lifecycle:

1. **First decrypt** -- SDK generates an FHE keypair, creates EIP-712 typed data, and prompts the wallet to sign. The signed credential is stored.
2. **Subsequent decrypts** -- If cached credentials cover the requested token, they are reused silently (no wallet prompt).
3. **Expiry** -- Credentials expire based on `credentialDurationDays`. After expiry, the next decrypt re-prompts the wallet.
4. **Pre-authorization** -- Call `useAuthorizeAll(tokenAddresses)` early to batch-authorize all tokens in one wallet prompt, avoiding repeated popups.
