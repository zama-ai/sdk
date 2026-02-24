# Zama Confidential Token SDK

TypeScript SDKs for privacy-preserving ERC-20 token operations using [Fully Homomorphic Encryption](https://www.zama.ai/fhevm) (Zama fhEVM). Shield, transfer, and unshield tokens with encrypted balances — no one sees your amounts on-chain.

## Packages

| Package                                        | Description                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`@zama-fhe/sdk`](./packages/sdk/)             | Core SDK — confidential token operations, FHE relayer, contract call builders, viem/ethers adapters, Node.js worker pool |
| [`@zama-fhe/react-sdk`](./packages/react-sdk/) | React hooks wrapping the core SDK via `@tanstack/react-query`, with viem/ethers/wagmi sub-paths                          |

## What Are Confidential Tokens?

Confidential tokens are ERC-20 tokens with encrypted balances and transfer amounts, powered by Fully Homomorphic Encryption (FHE). The smart contracts operate on ciphertexts — they can add, subtract, and compare encrypted values without ever decrypting them on-chain. Only the token holder (or an authorized operator) can decrypt their own balance.

The SDK handles all the FHE complexity for you: key generation, encryption, decryption, and proof management are abstracted behind a clean API.

### Key Operations

- **Shield (wrap)** — Deposit public ERC-20 tokens into their confidential counterpart. Your balance becomes encrypted.
- **Confidential transfer** — Send tokens to another address. The amount is encrypted — only sender and recipient can see it.
- **Unshield (unwrap + finalize)** — Withdraw confidential tokens back to public ERC-20. Orchestrates the two on-chain steps (unwrap request, then finalize with a decryption proof) in a single call.
- **Balance decryption** — Decrypt your own balance using FHE credentials stored locally.

## Quick Start

### Install

```bash
# Core SDK (vanilla TypeScript)
pnpm add @zama-fhe/sdk

# React hooks
pnpm add @zama-fhe/react-sdk @tanstack/react-query
```

### React with wagmi

```tsx
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TokenSDKProvider,
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
const signer = new WagmiSigner(wagmiConfig);
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
        <TokenSDKProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          <TokenDashboard />
        </TokenSDKProvider>
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

### Browser with viem

```ts
import { TokenSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner(walletClient, publicClient);

const sdk = new TokenSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
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
await token.wrap(1000n);

// Check your decrypted balance
const balance = await token.balanceOf();

// Confidential transfer — amount is encrypted on-chain
await token.confidentialTransfer("0xRecipient", 500n);

// Unshield back to public ERC-20
await token.unshield(500n);
```

### Browser with ethers

```ts
import { TokenSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner(ethersSigner);

const sdk = new TokenSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new IndexedDBStorage(),
});
```

### Node.js

```ts
import { TokenSDK, MemoryStorage } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner(walletClient, publicClient);

const sdk = new TokenSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4, // number of worker threads (default: min(CPUs, 4))
    transports: {
      [1]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: new MemoryStorage(),
});
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your Application                 │
├──────────────────────┬──────────────────────────────┤
│  react-sdk     │  token-sdk (vanilla TS)      │
│  React hooks +       │  TokenSDK                    │
│  React Query cache   │  Token                       │
│                      │  ReadonlyToken               │
├──────────────────────┴──────────────────────────────┤
│                   Signer Adapters                   │
│       ViemSigner · EthersSigner · WagmiSigner       │
├─────────────────────────────────────────────────────┤
│                  Relayer Backend                    │
│       RelayerWeb (browser, Web Worker + WASM)       │
│       RelayerNode (Node.js, worker threads)         │
├─────────────────────────────────────────────────────┤
│              fhEVM Smart Contracts                  │
│       Encrypted ERC-20 · Wrapper · Coordinator      │
└─────────────────────────────────────────────────────┘
```

### Entry Points

Each package exposes multiple entry points for tree-shaking:

**`@zama-fhe/sdk`**
| Import Path | Contents |
| --- | --- |
| `@zama-fhe/sdk` | Core SDK, RelayerWeb, storage, ABIs, event decoders, contract call builders |
| `@zama-fhe/sdk/viem` | `ViemSigner` adapter + viem read/write contract helpers |
| `@zama-fhe/sdk/ethers` | `EthersSigner` adapter + ethers read/write contract helpers |
| `@zama-fhe/sdk/node` | `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, network presets |

**`@zama-fhe/react-sdk`**
| Import Path | Contents |
| --- | --- |
| `@zama-fhe/react-sdk` | Provider-based hooks + all re-exports from core SDK |
| `@zama-fhe/react-sdk/viem` | Viem-specific hooks + `ViemSigner` |
| `@zama-fhe/react-sdk/ethers` | Ethers-specific hooks + `EthersSigner` |
| `@zama-fhe/react-sdk/wagmi` | Wagmi-specific hooks + `WagmiSigner` |

## Supported Networks

| Network          | Chain ID | Preset Config   |
| ---------------- | -------- | --------------- |
| Ethereum Mainnet | 1        | `MainnetConfig` |
| Sepolia Testnet  | 11155111 | `SepoliaConfig` |
| Local Hardhat    | 31337    | `HardhatConfig` |

Defaults for known chains are merged automatically — you only need to supply `relayerUrl` and `network` (RPC URL).

## Integration Guide

### 1. Choose Your Stack

| Stack                 | SDK                   | Provider           | Signer                         |
| --------------------- | --------------------- | ------------------ | ------------------------------ |
| React + wagmi         | `react-sdk`           | `TokenSDKProvider` | `WagmiSigner`                  |
| React + viem          | `react-sdk`           | `TokenSDKProvider` | `ViemSigner`                   |
| React + ethers        | `react-sdk`           | `TokenSDKProvider` | `EthersSigner`                 |
| React + custom signer | `react-sdk`           | `TokenSDKProvider` | Implement `GenericSigner`      |
| Vanilla TS + viem     | `token-sdk`           | N/A                | `ViemSigner`                   |
| Vanilla TS + ethers   | `token-sdk`           | N/A                | `EthersSigner`                 |
| Node.js backend       | `token-sdk` + `/node` | N/A                | `ViemSigner` or `EthersSigner` |

### 2. Configure the Relayer

The relayer handles FHE operations (encryption, decryption, key generation). Choose the right backend for your environment:

| Environment | Class         | Import               |
| ----------- | ------------- | -------------------- |
| Browser     | `RelayerWeb`  | `@zama-fhe/sdk`      |
| Node.js     | `RelayerNode` | `@zama-fhe/sdk/node` |

`RelayerWeb` runs FHE in a Web Worker loading WASM from CDN. `RelayerNode` calls the relayer SDK directly and supports worker threads via `NodeWorkerClient` / `NodeWorkerPool` for parallel operations.

### 3. Authentication

The relayer requires an API key. There are two approaches:

**Option A — Proxy (recommended for browser apps)**

Route relayer requests through your own backend that injects the API key. This keeps the key out of client-side code:

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [11155111]: {
      relayerUrl: "https://your-backend.com/api/relayer", // your proxy forwards to relayer.zama.ai
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

**Option B — Direct API key via transport config**

Pass the API key directly using the `auth` option. Three authentication methods are supported:

```ts
// API key via header (default header: x-api-key)
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [11155111]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: "your-api-key" },
    },
  },
});

// API key via cookie (default cookie name: x-api-key)
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Bearer token
auth: { __type: "BearerToken", token: "your-bearer-token" }
```

The `Auth` types (`ApiKeyHeader`, `ApiKeyCookie`, `BearerToken`) are exported from `@zama-fhe/sdk` for TypeScript usage.

### 4. Choose a Storage

FHE credentials (keypair + EIP-712 signature) need to be persisted so users don't re-sign on every page load:

| Storage            | Use Case                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| `IndexedDBStorage` | Browser production (persistent across sessions)                                  |
| `indexedDBStorage` | Pre-built singleton of `IndexedDBStorage`                                        |
| `MemoryStorage`    | Testing / Node.js scripts (lost on restart)                                      |
| Custom             | Implement `GenericStringStorage` (3 methods: `getItem`, `setItem`, `removeItem`) |

### 5. Token Operations

```ts
const token = sdk.createToken("0xEncryptedERC20Address");

// Shield: public ERC-20 → confidential
await token.wrap(1000n);
await token.wrapETH(1000n); // for native ETH wrappers

// Read balance (decrypts automatically)
const balance = await token.balanceOf();

// Transfer (encrypted on-chain)
await token.confidentialTransfer("0xRecipient", 500n);

// Unshield: confidential → public ERC-20
await token.unshield(500n); // specific amount
await token.unshieldAll(); // entire balance

// Operator approval
await token.approve("0xSpender");
const approved = await token.isApproved("0xSpender");
```

### 6. Custom Signer (Advanced)

If you're not using viem or ethers, implement the `GenericSigner` interface:

```ts
interface GenericSigner {
  getChainId(): Promise<number>;
  getAddress(): Promise<Address>;
  signTypedData(typedData: EIP712TypedData): Promise<Address>;
  writeContract(config: ContractCallConfig): Promise<Address>;
  readContract(config: ContractCallConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Address): Promise<TransactionReceipt>;
}
```

### 7. Low-Level Contract Call Builders

For full control, use the contract call builders that return `ContractCallConfig` objects compatible with any Web3 library:

```ts
import {
  wrapContract,
  confidentialTransferContract,
  confidentialBalanceOfContract,
} from "@zama-fhe/sdk";

// Returns { address, abi, functionName, args, value? }
const callConfig = wrapContract("0xWrapper", "0xRecipient", 1000n);
```

The `/viem` and `/ethers` sub-paths provide pre-wrapped helpers that execute calls directly:

```ts
// viem
import { writeWrapContract, readConfidentialBalanceOfContract } from "@zama-fhe/sdk/viem";
const txHash = await writeWrapContract(walletClient, wrapper, to, amount);

// ethers
import { writeWrapContract, readConfidentialBalanceOfContract } from "@zama-fhe/sdk/ethers";
const txHash = await writeWrapContract(signer, wrapper, to, amount);
```

## Error Handling

All SDK errors extend `TokenError`. Use `instanceof` to catch specific error types:

```ts
import {
  TokenError,
  SigningRejectedError,
  EncryptionFailedError,
  TransactionRevertedError,
} from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // User rejected wallet signature
  }
  if (error instanceof EncryptionFailedError) {
    // FHE encryption failed
  }
  if (error instanceof TransactionRevertedError) {
    // On-chain transaction reverted
  }
  if (error instanceof TokenError) {
    // Any other SDK error — check error.code for details
  }
}
```

| Error Class                | Code                   | Description                                |
| -------------------------- | ---------------------- | ------------------------------------------ |
| `SigningRejectedError`     | `SIGNING_REJECTED`     | User rejected the wallet signature request |
| `SigningFailedError`       | `SIGNING_FAILED`       | Wallet signature failed (non-rejection)    |
| `EncryptionFailedError`    | `ENCRYPTION_FAILED`    | FHE encryption operation failed            |
| `DecryptionFailedError`    | `DECRYPTION_FAILED`    | FHE decryption operation failed            |
| `ApprovalFailedError`      | `APPROVAL_FAILED`      | ERC-20 approval transaction failed         |
| `TransactionRevertedError` | `TRANSACTION_REVERTED` | On-chain transaction reverted              |

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 10

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build                  # Build all (token-sdk first, then react-sdk)
pnpm build:sdk              # Build core SDK only
pnpm build:react-sdk        # Build React SDK only
```

### Test

```bash
pnpm test              # Watch mode
pnpm test:run          # Single run
pnpm typecheck         # Type checking
pnpm lint              # Linting
pnpm format:check      # Formatting check
```

### E2E Tests

The test app in `packages/test-app` runs Playwright tests against a local Hardhat node with FHE mock contracts:

```bash
pnpm submodule:init    # Initialize hardhat submodule (first time)
pnpm hardhat:install   # Install hardhat dependencies
pnpm e2e:test          # Run E2E tests (auto-starts hardhat + next dev)
pnpm e2e:test:ui       # Playwright UI mode
```

## License

[BSD-3-Clause](./LICENSE)
