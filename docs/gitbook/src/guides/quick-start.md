# Quick Start

Pick the setup that matches your stack. Each example gets you from zero to a working confidential transfer.

## Authentication

The relayer requires an API key. In the examples below, replace the relayer URL with your own backend proxy that injects the key (recommended for browser apps), or pass the key directly for server-side use:

```ts
// Option A: proxy through your backend (browser apps)
relayerUrl: "https://your-app.com/api/relayer"

// Option B: direct API key (server-side / prototyping)
relayerUrl: "https://relayer.zama.ai",
auth: { __type: "ApiKeyHeader", value: "your-api-key" }
```

See [Configuration > Authentication](sdk/configuration.md#authentication) for full details and a backend proxy example.

---

## React + wagmi

The most common setup for dApps. You'll need wagmi, React Query, and the React SDK.

```bash
pnpm add @zama-fhe/react-sdk @tanstack/react-query wagmi viem
```

### 1. Set up providers

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

const queryClient = new QueryClient();
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

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <MyTokenPage />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### 2. Use hooks in your components

```tsx
import { useConfidentialBalance, useConfidentialTransfer, useShield } from "@zama-fhe/react-sdk";

function MyTokenPage() {
  const TOKEN = "0xYourEncryptedERC20";

  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: TOKEN,
  });
  const { mutateAsync: transfer, isPending: isSending } = useConfidentialTransfer({
    tokenAddress: TOKEN,
  });
  const { mutateAsync: shield } = useShield({ tokenAddress: TOKEN });

  return (
    <div>
      <p>Balance: {isLoading ? "Decrypting..." : balance?.toString()}</p>

      <button onClick={() => shield({ amount: 1000n })}>Shield 1,000 tokens</button>

      <button disabled={isSending} onClick={() => transfer({ to: "0xRecipient", amount: 100n })}>
        Send 100 (private)
      </button>
    </div>
  );
}
```

That's it. The hooks handle FHE encryption, wallet signing, ERC-20 approvals, and cache invalidation automatically.

---

## Browser + viem (no React)

For vanilla TypeScript apps that use viem for wallet interactions.

```bash
pnpm add @zama-fhe/sdk viem
```

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { sepolia } from "viem/chains";

// walletClient and publicClient come from your viem setup
const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [sepolia.id]: {
        relayerUrl: "https://your-app.com/api/relayer",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new IndexedDBStorage(),
});

const token = sdk.createToken("0xYourEncryptedERC20");

// Shield 1000 public tokens into confidential form
// (handles ERC-20 approval automatically)
const { txHash } = await token.shield(1000n);

// Decrypt your balance — first time prompts the wallet for a signature
const balance = await token.balanceOf();
console.log("My confidential balance:", balance);

// Send 500 tokens privately
await token.confidentialTransfer("0xRecipient", 500n);

// Withdraw back to public ERC-20
await token.unshield(500n);
```

---

## Browser + ethers

Same flow, different signer adapter.

```bash
pnpm add @zama-fhe/sdk ethers
```

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

// ethersSigner comes from your ethers setup (e.g. BrowserProvider.getSigner())
const signer = new EthersSigner({ signer: ethersSigner });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new IndexedDBStorage(),
});

// Same API as viem — createToken, shield, balanceOf, etc.
```

---

## Node.js

For backend services, scripts, and bots. Uses native worker threads instead of a Web Worker.

```bash
pnpm add @zama-fhe/sdk viem @zama-fhe/relayer-sdk
```

```ts
import { ZamaSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4, // worker threads (defaults to min(CPU cores, 4))
    transports: {
      [sepolia.id]: {
        relayerUrl: "https://your-app.com/api/relayer",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  // in-memory for scripts; implement GenericStringStorage for persistence
  storage: new MemoryStorage(),
});

// Same Token API as browser
const token = sdk.createToken("0xYourEncryptedERC20");
const balance = await token.balanceOf();
```

---

## Next steps

- [Core SDK guide](sdk/overview.md) — all the things you can do with tokens
- [React SDK guide](react-sdk/overview.md) — hooks, providers, and caching
- [Configuration](sdk/configuration.md) — authentication, storage, networks, and relayer setup
