---
title: Quick Start
description: Get from zero to a working confidential transfer in under 5 minutes.
---

# Quick Start

Pick your stack. Each tab gets you from install to a working confidential transfer.

The first three tabs are for **browser apps** (React dApp, vanilla viem, or ethers). The **Node.js** tabs are for backend services, scripts, and bots that operate on confidential tokens server-side — they use native worker threads instead of a Web Worker and store keys in memory.

In browser apps, prefix client-side variables with `NEXT_PUBLIC_` (Next.js) or `VITE_` (Vite) so the bundler exposes them.

## Authentication

The relayer requires an API key. In browser apps, proxy requests through your backend so the key stays server-side. For server-side scripts or prototyping, pass the key directly:

```ts
// Browser apps: proxy through your backend (recommended)
relayerUrl: "https://your-app.com/api/relayer/1"

// Server-side / prototyping: pass the key directly
auth: { __type: "ApiKeyHeader", value: "your-api-key" }
```

See [Authentication](/guides/authentication) for a backend proxy example.

## Install

::: code-group

```bash [React + wagmi]
pnpm add @zama-fhe/react-sdk @tanstack/react-query wagmi viem
```

```bash [viem]
pnpm add @zama-fhe/sdk viem
```

```bash [ethers]
pnpm add @zama-fhe/sdk ethers
```

```bash [Node.js (viem)]
pnpm add @zama-fhe/sdk viem
```

```bash [Node.js (ethers)]
pnpm add @zama-fhe/sdk ethers
```

:::

## Set up the SDK

::: code-group

```tsx [React + wagmi]
import { WagmiProvider, createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, RelayerWeb, indexedDBStorage } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/YOUR_KEY"),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
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
          <MyTokenPage />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

```ts [viem]
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});
const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});
const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [sepolia.id]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

```ts [ethers]
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ ethereum: window.ethereum! });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

```ts [Node.js (viem)]
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(process.env.RPC_URL),
});
const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4,
    transports: {
      [sepolia.id]: {
        network: process.env.RPC_URL!,
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
      },
    },
  }),
  signer,
  storage: memoryStorage,
});
```

```ts [Node.js (ethers)]
import { ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { Wallet, JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider(process.env.RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
const signer = new EthersSigner({ signer: wallet });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4,
    transports: {
      [11155111]: {
        network: process.env.RPC_URL!,
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
      },
    },
  }),
  signer,
  storage: memoryStorage,
});
```

:::

## Your first confidential transfer

::: code-group

```tsx [React + wagmi]
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  useConfidentialBalance,
  useConfidentialTransfer,
  useShield,
  useMetadata,
} from "@zama-fhe/react-sdk";

function MyTokenPage() {
  const TOKEN = "0xYourEncryptedERC20";
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: meta } = useMetadata(TOKEN);
  const { data: balance, isLoading } = useConfidentialBalance({
    tokenAddress: TOKEN,
  });
  const { mutateAsync: shield } = useShield({ tokenAddress: TOKEN });
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress: TOKEN,
  });

  if (!isConnected) {
    return <button onClick={() => connect({ connector: injected() })}>Connect Wallet</button>;
  }

  return (
    <div>
      <p>Connected: {address}</p>
      {meta && (
        <p>
          Token: {meta.name} ({meta.symbol})
        </p>
      )}
      <p>Balance: {isLoading ? "Decrypting..." : balance?.toString()}</p>
      <button onClick={() => shield({ amount: 1000n })}>Shield 1,000 tokens</button>
      <button disabled={isPending} onClick={() => transfer({ to: "0xRecipient", amount: 100n })}>
        Send 100 (private)
      </button>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
```

```ts [viem]
const token = sdk.createToken("0xYourEncryptedERC20");

// Shield 1,000 public tokens into confidential form
await token.shield(1000n);

// Decrypt your balance (first call prompts a wallet signature)
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// Send 500 tokens privately
await token.confidentialTransfer("0xRecipient", 500n);

// Withdraw back to public ERC-20
await token.unshield(500n);
```

```ts [ethers]
const token = sdk.createToken("0xYourEncryptedERC20");

// Shield 1,000 public tokens into confidential form
await token.shield(1000n);

// Decrypt your balance (first call prompts a wallet signature)
const balance = await token.balanceOf();
console.log("Confidential balance:", balance);

// Send 500 tokens privately
await token.confidentialTransfer("0xRecipient", 500n);

// Withdraw back to public ERC-20
await token.unshield(500n);
```

```ts [Node.js (viem)]
const token = sdk.createToken(process.env.TOKEN_ADDRESS!);

try {
  // Shield 1,000 public tokens into confidential form
  await token.shield(1000n);

  // Decrypt your balance
  const balance = await token.balanceOf();
  console.log("Confidential balance:", balance);

  // Send 500 tokens privately
  await token.confidentialTransfer("0xRecipient", 500n);

  // Withdraw back to public ERC-20
  await token.unshield(500n);
} finally {
  sdk.terminate(); // clean up worker threads
}
```

```ts [Node.js (ethers)]
const token = sdk.createToken(process.env.TOKEN_ADDRESS!);

try {
  // Shield 1,000 public tokens into confidential form
  await token.shield(1000n);

  // Decrypt your balance
  const balance = await token.balanceOf();
  console.log("Confidential balance:", balance);

  // Send 500 tokens privately
  await token.confidentialTransfer("0xRecipient", 500n);

  // Withdraw back to public ERC-20
  await token.unshield(500n);
} finally {
  sdk.terminate(); // clean up worker threads
}
```

:::

The hooks and SDK methods handle FHE encryption, wallet signing, ERC-20 approvals, and cache invalidation automatically.

## Next steps

- [Configuration](/guides/configuration) -- relayer, signer, storage, and authentication setup
- [Shield Tokens](/guides/shield-tokens) -- move tokens into confidential form
- [Network Presets](/reference/sdk/network-presets) -- pre-configured contract addresses for Sepolia, Mainnet, and Hardhat
- [React Hooks](/reference/react/ZamaProvider) -- provider setup and all available hooks
- [How FHE Works](/concepts/how-fhe-works) -- understand the cryptography
