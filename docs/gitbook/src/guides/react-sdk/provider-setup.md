# Provider Setup

Every React app using the SDK needs a `ZamaProvider` in the component tree. It wires up the relayer, signer, and storage so all hooks can access them.

```tsx
<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={storage}
  credentialDurationDays={1} // optional, default: 1 day
  onEvent={(e) => console.debug(e)} // optional, for debugging
>
  {children}
</ZamaProvider>
```

Below are complete setup examples for each Web3 library.

## wagmi

The most common setup for React dApps.

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer",
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

## viem (without wagmi)

For React apps using viem directly.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/react-sdk/viem";

// walletClient and publicClient from your viem setup
const signer = new ViemSigner({ walletClient, publicClient });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer",
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

## ethers

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { EthersSigner } from "@zama-fhe/react-sdk/ethers";

// ethersSigner from BrowserProvider.getSigner() or similar
const signer = new EthersSigner({ signer: ethersSigner });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [11155111]: {
      relayerUrl: "https://your-app.com/api/relayer",
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

## Custom signer

If you're not using viem, ethers, or wagmi, implement the `GenericSigner` interface and pass your own:

```tsx
<ZamaProvider relayer={relayer} signer={yourCustomSigner} storage={new MemoryStorage()}>
  <YourApp />
</ZamaProvider>
```

See the [Configuration](../sdk/configuration.md#custom-signer) page for the `GenericSigner` interface.

## Next.js / SSR

FHE operations require browser APIs (Web Workers, WASM, IndexedDB). They can't run on the server.

1. Add `"use client"` to any file that uses SDK hooks
2. Place `ZamaProvider` inside a client component
3. Don't create the relayer or signer at module level in a server component — initialize them inside a client component or use lazy initialization

```tsx
"use client";

import { useConfidentialBalance } from "@zama-fhe/react-sdk";

export function TokenBalance({ address }: { address: string }) {
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: address,
  });
  return <span>{isLoading ? "..." : balance?.toString()}</span>;
}
```

## FHE credential lifecycle

When a user first decrypts a balance, the SDK:

1. Generates an FHE keypair
2. Creates EIP-712 typed data and prompts the wallet to sign
3. Stores the signed credential in your storage backend

On subsequent decrypts, cached credentials are reused silently — no wallet popup.

Credentials expire after `credentialDurationDays` (default: 1). After expiry, the wallet is prompted again.

To avoid multiple popups when your app shows several token balances, pre-authorize all tokens at once:

```tsx
const { mutateAsync: authorizeAll } = useAuthorizeAll();

// Call this early, e.g. after loading the token list
await authorizeAll(allTokenAddresses);
// Now all balance decrypts reuse the cached credential
```
