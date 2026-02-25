# Quick Start

## Install

```bash
# Core SDK (vanilla TypeScript)
pnpm add @zama-fhe/sdk

# React hooks
pnpm add @zama-fhe/react-sdk @tanstack/react-query
```

## React with wagmi

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  RelayerWeb,
  indexedDBStorage,
  useConfidentialBalance,
  useConfidentialTransfer,
  useShield,
} from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http("https://mainnet.infura.io/v3/YOUR_KEY"),
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const queryClient = new QueryClient();
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
          <TokenDashboard />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TokenDashboard() {
  const { data: balance, isLoading } = useConfidentialBalance("0xTokenAddress");
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress: "0xTokenAddress",
  });
  const { mutateAsync: shield } = useShield({ tokenAddress: "0xTokenAddress" });

  return (
    <div>
      <p>Balance: {isLoading ? "Decrypting..." : balance?.toString()}</p>
      <button onClick={() => shield({ amount: 1000n })}>Shield 1000</button>
      <button onClick={() => transfer({ to: "0xRecipient", amount: 100n })} disabled={isPending}>
        Send 100
      </button>
    </div>
  );
}
```

## Browser with viem

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
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
  }),
  signer,
  storage: new IndexedDBStorage(),
});

const token = sdk.createToken("0xEncryptedERC20Address");

// Shield 1000 tokens (handles ERC-20 approval automatically)
const { txHash } = await token.shield(1000n);

// Check your decrypted balance
const balance = await token.balanceOf();

// Confidential transfer — amount is encrypted on-chain
await token.confidentialTransfer("0xRecipient", 500n);

// Unshield back to public ERC-20
await token.unshield(500n);
```

## Browser with ethers

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ signer: ethersSigner });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [MainnetConfig.chainId]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [SepoliaConfig.chainId]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new IndexedDBStorage(),
});
```

## Node.js

```ts
import { ZamaSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4, // number of worker threads (default: min(CPUs, 4))
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
  }),
  signer,
  storage: new MemoryStorage(),
});
```

## Next Steps

- [Core SDK Overview](sdk/overview.md) — full API surface and design
- [React SDK Overview](react-sdk/overview.md) — hooks and provider setup
- [Configuration](sdk/configuration.md) — relayer, storage, and network setup
- [Token Operations](sdk/token-operations.md) — shield, transfer, unshield, balance decryption
