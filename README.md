# Zama Confidential Token SDK

TypeScript SDKs for privacy-preserving ERC-20 token operations using [Fully Homomorphic Encryption](https://www.zama.ai/fhevm) (Zama fhEVM). Shield, transfer, and unshield tokens with encrypted balances — no one sees your amounts on-chain.

## Packages

| Package                                                    | Description                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`@zama-fhe/token-sdk`](./packages/token-sdk/)             | Core SDK — confidential token operations, FHE relayer, contract call builders, viem/ethers adapters, Node.js worker pool |
| [`@zama-fhe/token-react-sdk`](./packages/token-react-sdk/) | React hooks wrapping the core SDK via `@tanstack/react-query`, with viem/ethers/wagmi sub-paths                          |

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
pnpm add @zama-fhe/token-sdk

# React hooks
pnpm add @zama-fhe/token-react-sdk @tanstack/react-query
```

### React with wagmi

```tsx
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiTokenSDKProvider } from "@zama-fhe/token-react-sdk/wagmi";
import {
  RelayerWeb,
  indexedDBStorage,
  useConfidentialBalance,
  useConfidentialTransfer,
  useWrap,
} from "@zama-fhe/token-react-sdk";

const queryClient = new QueryClient();
const relayer = new RelayerWeb({
  chainId: 11155111,
  transports: {
    [11155111]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiTokenSDKProvider relayer={relayer} storage={indexedDBStorage}>
          <TokenDashboard />
        </WagmiTokenSDKProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TokenDashboard() {
  const { data: balance, isLoading } = useConfidentialBalance("0xTokenAddress");
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress: "0xTokenAddress",
  });
  const { mutateAsync: wrap } = useWrap({ tokenAddress: "0xTokenAddress" });

  return (
    <div>
      <p>Balance: {isLoading ? "Decrypting..." : balance?.toString()}</p>
      <button onClick={() => wrap({ amount: 1000n })}>Shield 1000</button>
      <button onClick={() => transfer({ to: "0xRecipient", amount: 100n })} disabled={isPending}>
        Send 100
      </button>
    </div>
  );
}
```

### Browser with viem

```ts
import { TokenSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/token-sdk";
import { ViemSigner } from "@zama-fhe/token-sdk/viem";

const sdk = new TokenSDK({
  relayer: new RelayerWeb({
    chainId: 11155111,
    transports: {
      [11155111]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new ViemSigner(walletClient, publicClient),
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
import { TokenSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/token-sdk";
import { EthersSigner } from "@zama-fhe/token-sdk/ethers";

const sdk = new TokenSDK({
  relayer: new RelayerWeb({
    chainId: 11155111,
    transports: {
      [11155111]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new EthersSigner(ethersSigner),
  storage: new IndexedDBStorage(),
});
```

### Node.js

```ts
import { TokenSDK, MemoryStorage } from "@zama-fhe/token-sdk";
import { RelayerNode } from "@zama-fhe/token-sdk/node";
import { ViemSigner } from "@zama-fhe/token-sdk/viem";

const sdk = new TokenSDK({
  relayer: new RelayerNode({
    chainId: 11155111,
    transports: {
      [11155111]: {
        relayerUrl: "https://relayer.zama.ai",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer: new ViemSigner(walletClient, publicClient),
  storage: new MemoryStorage(),
});
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your Application                  │
├──────────────────────┬──────────────────────────────┤
│  token-react-sdk     │  token-sdk (vanilla TS)      │
│  React hooks +       │  TokenSDK             │
│  React Query cache   │  ConfidentialToken            │
│                      │  ReadonlyConfidentialToken    │
├──────────────────────┴──────────────────────────────┤
│                   Signer Adapters                    │
│           ViemSigner · EthersSigner · WagmiSigner    │
├─────────────────────────────────────────────────────┤
│                  Relayer Backend                     │
│     RelayerWeb (browser, Web Worker + WASM)          │
│     RelayerNode (Node.js, worker threads)            │
├─────────────────────────────────────────────────────┤
│              fhEVM Smart Contracts                   │
│       Encrypted ERC-20 · Wrapper · Coordinator       │
└─────────────────────────────────────────────────────┘
```

### Entry Points

Each package exposes multiple entry points for tree-shaking:

**`@zama-fhe/token-sdk`**
| Import Path | Contents |
| --- | --- |
| `@zama-fhe/token-sdk` | Core SDK, RelayerWeb, storage, ABIs, event decoders, contract call builders |
| `@zama-fhe/token-sdk/viem` | `ViemSigner` adapter + viem read/write contract helpers |
| `@zama-fhe/token-sdk/ethers` | `EthersSigner` adapter + ethers read/write contract helpers |
| `@zama-fhe/token-sdk/node` | `RelayerNode`, `NodeWorkerClient`, `NodeWorkerPool`, network presets |

**`@zama-fhe/token-react-sdk`**
| Import Path | Contents |
| --- | --- |
| `@zama-fhe/token-react-sdk` | Provider-based hooks + all re-exports from core SDK |
| `@zama-fhe/token-react-sdk/viem` | Viem-specific hooks + `ViemTokenSDKProvider` |
| `@zama-fhe/token-react-sdk/ethers` | Ethers-specific hooks + `EthersTokenSDKProvider` |
| `@zama-fhe/token-react-sdk/wagmi` | Wagmi-specific hooks + `WagmiTokenSDKProvider` |

## Supported Networks

| Network          | Chain ID | Preset Config   |
| ---------------- | -------- | --------------- |
| Ethereum Mainnet | 1        | `MainnetConfig` |
| Sepolia Testnet  | 11155111 | `SepoliaConfig` |
| Local Hardhat    | 31337    | `HardhatConfig` |

Defaults for known chains are merged automatically — you only need to supply `relayerUrl` and `network` (RPC URL).

## Integration Guide

### 1. Choose Your Stack

| Stack                 | SDK                   | Provider                 | Signer                         |
| --------------------- | --------------------- | ------------------------ | ------------------------------ |
| React + wagmi         | `token-react-sdk`     | `WagmiTokenSDKProvider`  | Auto-derived from wagmi        |
| React + viem          | `token-react-sdk`     | `ViemTokenSDKProvider`   | `ViemSigner`                   |
| React + ethers        | `token-react-sdk`     | `EthersTokenSDKProvider` | `EthersSigner`                 |
| React + custom signer | `token-react-sdk`     | `TokenSDKProvider`       | Implement `ConfidentialSigner` |
| Vanilla TS + viem     | `token-sdk`           | N/A                      | `ViemSigner`                   |
| Vanilla TS + ethers   | `token-sdk`           | N/A                      | `EthersSigner`                 |
| Node.js backend       | `token-sdk` + `/node` | N/A                      | `ViemSigner` or `EthersSigner` |

### 2. Configure the Relayer

The relayer handles FHE operations (encryption, decryption, key generation). Choose the right backend for your environment:

| Environment | Class         | Import                     |
| ----------- | ------------- | -------------------------- |
| Browser     | `RelayerWeb`  | `@zama-fhe/token-sdk`      |
| Node.js     | `RelayerNode` | `@zama-fhe/token-sdk/node` |

`RelayerWeb` runs FHE in a Web Worker loading WASM from CDN. `RelayerNode` calls the relayer SDK directly and supports worker threads via `NodeWorkerClient` / `NodeWorkerPool` for parallel operations.

### 3. Authentication

The relayer requires an API key. There are two approaches:

**Option A — Proxy (recommended for browser apps)**

Route relayer requests through your own backend that injects the API key. This keeps the key out of client-side code:

```ts
const relayer = new RelayerWeb({
  chainId: 11155111,
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
  chainId: 11155111,
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

The `Auth` types (`ApiKeyHeader`, `ApiKeyCookie`, `BearerToken`) are exported from `@zama-fhe/token-sdk` for TypeScript usage.

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

If you're not using viem or ethers, implement the `ConfidentialSigner` interface:

```ts
interface ConfidentialSigner {
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
} from "@zama-fhe/token-sdk";

// Returns { address, abi, functionName, args, value? }
const callConfig = wrapContract("0xWrapper", "0xRecipient", 1000n);
```

The `/viem` and `/ethers` sub-paths provide pre-wrapped helpers that execute calls directly:

```ts
// viem
import { writeWrapContract, readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/viem";
const txHash = await writeWrapContract(walletClient, wrapper, to, amount);

// ethers
import { writeWrapContract, readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/ethers";
const txHash = await writeWrapContract(signer, wrapper, to, amount);
```

## Error Handling

All SDK errors are instances of `ConfidentialTokenError` with typed error codes:

```ts
import { ConfidentialTokenError, ConfidentialTokenErrorCode } from "@zama-fhe/token-sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof ConfidentialTokenError) {
    switch (error.code) {
      case ConfidentialTokenErrorCode.SigningRejected:
        // User rejected wallet signature
        break;
      case ConfidentialTokenErrorCode.EncryptionFailed:
        // FHE encryption failed
        break;
      case ConfidentialTokenErrorCode.TransactionReverted:
        // On-chain transaction reverted
        break;
    }
  }
}
```

| Error Code            | Description                                  |
| --------------------- | -------------------------------------------- |
| `SigningRejected`     | User rejected the wallet signature request   |
| `SigningFailed`       | Wallet signature failed (non-rejection)      |
| `EncryptionFailed`    | FHE encryption operation failed              |
| `DecryptionFailed`    | FHE decryption operation failed              |
| `NotConfidential`     | Token does not support ERC-7984              |
| `NotWrapper`          | Token does not support the wrapper interface |
| `ApprovalFailed`      | ERC-20 approval transaction failed           |
| `TransactionReverted` | On-chain transaction reverted                |
| `StoreError`          | Credential storage read/write failed         |

## Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build                  # Build all (token-sdk first, then token-react-sdk)
pnpm --filter @zama-fhe/token-sdk build        # Build core SDK only
pnpm --filter @zama-fhe/token-react-sdk build   # Build React SDK only
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
