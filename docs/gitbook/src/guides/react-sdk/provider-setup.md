# Provider Setup

Every React app using the SDK needs a `ZamaProvider` in the component tree. It wires up the relayer, signer, and storage so all hooks can access them.

```tsx
<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={storage}
  sessionStorage={sessionStorage} // optional — wallet signature storage (default: in-memory)
  credentialDurationDays={1} // optional, default: 1 day
  onEvent={(e) => console.debug(e)} // optional, for debugging
>
  {children}
</ZamaProvider>
```

For web extensions, pass a `ChromeSessionStorage` instance as `sessionStorage` so wallet signatures survive service worker restarts. See the [SDK configuration guide](../sdk/configuration.md#web-extensions) for a complete example.

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

## viem (without wagmi)

For React apps using viem directly.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

// walletClient and publicClient from your viem setup
// (walletClient is optional — omit it for read-only chain queries)
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

## ethers

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

/**
 * Browser — pass the raw EIP-1193 provider (subscribe() works automatically)
 * const signer = new EthersSigner({ ethereum: window.ethereum! });
 * Node.js — pass an ethers Signer directly
 * const provider = new ethers.JsonRpcProvider(rpcUrl);
 * const signer = new EthersSigner({ signer: new ethers.Wallet(privateKey, provider) });
 * Read-only — pass a Provider (no signing, chain reads only)
 * const signer = new EthersSigner({ provider: new ethers.JsonRpcProvider(rpcUrl) });
 */
const signer = new EthersSigner({ ethereum: window.ethereum! });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [11155111]: {
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

## Decrypt key lifecycle

When a user first decrypts a balance, the SDK:

1. Generates a decrypt keypair
2. Creates EIP-712 typed data and prompts the wallet to sign
3. Encrypts the private key with AES-GCM (key derived from the signature via PBKDF2)
4. Stores the encrypted decrypt key in your storage backend
5. Caches the wallet signature **in memory only** for the session

The wallet signature is never written to disk — only the encrypted decrypt key is persisted. On subsequent page loads, the user must re-sign once to authorize their decrypt keys for the session.

### Session flow

```
First visit:  generate keypair → wallet signs → encrypt & store → cache signature
Page reload:  load encrypted keys → wallet re-signs → cache signature
Same session: reuse cached signature — no wallet popup
Disconnect:   WagmiSigner auto-revokes; viem/ethers call sdk.revokeSession()
```

### Pre-authorize to avoid popups

To avoid multiple popups when your app shows several token balances, pre-authorize all tokens at once:

```tsx
const { mutateAsync: allow } = useAllow();

// Call this early, e.g. after loading the token list
await allow(allTokenAddresses);
// All balance decrypts reuse the cached session signature
```

Decrypt keys expire after `credentialDurationDays` (default: 1). After expiry, fresh keys are generated and the wallet is prompted again.
