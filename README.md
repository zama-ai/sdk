# Zama SDK

![Latest dev release](https://img.shields.io/npm/v/%40zama-fhe%2Fsdk/alpha?label=dev%20release)
![Latest dev release last updated](https://img.shields.io/npm/last-update/%40zama-fhe%2Fsdk/alpha)
![NPM License](https://img.shields.io/npm/l/%40zama-fhe%2Fsdk)
![GitHub Actions Workflow Status - Unit Tests](https://img.shields.io/github/actions/workflow/status/zama-ai/sdk/vitest.yml?label=unit%20tests)
![GitHub Actions Workflow Status - Playwright](https://img.shields.io/github/actions/workflow/status/zama-ai/sdk/playwright.yml?label=e2e%20tests)

TypeScript SDKs for privacy-preserving ERC-20 token operations using [Fully Homomorphic Encryption on Zama Protocol](https://docs.zama.org/protocol/protocol/overview). Shield, transfer, and unshield tokens with encrypted balances — no one sees your amounts on-chain.

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

The examples below use a backend proxy (`relayerUrl`) to keep your API key server-side. See [Authentication](#3-authentication) for the proxy setup and direct API key alternatives.

### Install

```bash
# Core SDK (vanilla TypeScript)
pnpm add @zama-fhe/sdk

# React hooks
pnpm add @zama-fhe/react-sdk @tanstack/react-query
```

### Read extended documentation

Temporary solution for reading extended documentation that will eventually be published to on docs.zama.org (Gitbook):

```bash
# Install dependencies
pnpm install

# Serve docs
pnpm docs:preview
```

### React with wagmi

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

const signer = new WagmiSigner({ config: wagmiConfig });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [mainnet.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
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
          <TokenDashboard />
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TokenDashboard() {
  const { data: balance, isLoading } = useConfidentialBalance({ tokenAddress: "0xTokenAddress" });
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
import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [mainnet.id]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [sepolia.id]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
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

### Browser with ethers

```ts
import { ZamaSDK, RelayerWeb, IndexedDBStorage, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ signer: ethersSigner });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [MainnetConfig.chainId]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [SepoliaConfig.chainId]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
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
import { ZamaSDK } from "@zama-fhe/sdk";
import { RelayerNode, asyncLocalStorage } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { mainnet, sepolia } from "viem/chains";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerNode({
    getChainId: () => signer.getChainId(),
    poolSize: 4, // number of worker threads (default: min(CPUs, 4))
    transports: {
      [mainnet.id]: {
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
      },
      [sepolia.id]: {
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
      },
    },
  }),
  signer,
  storage: asyncLocalStorage,
});
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your Application                 │
├──────────────────────┬──────────────────────────────┤
│  react-sdk           │  sdk (vanilla TS)            │
│  React hooks +       │  ZamaSDK                     │
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

| Stack                 | SDK             | Provider       | Signer                         |
| --------------------- | --------------- | -------------- | ------------------------------ |
| React + wagmi         | `react-sdk`     | `ZamaProvider` | `WagmiSigner`                  |
| React + viem          | `react-sdk`     | `ZamaProvider` | `ViemSigner`                   |
| React + ethers        | `react-sdk`     | `ZamaProvider` | `EthersSigner`                 |
| React + custom signer | `react-sdk`     | `ZamaProvider` | Implement `GenericSigner`      |
| Vanilla TS + viem     | `sdk`           | N/A            | `ViemSigner`                   |
| Vanilla TS + ethers   | `sdk`           | N/A            | `EthersSigner`                 |
| Node.js backend       | `sdk` + `/node` | N/A            | `ViemSigner` or `EthersSigner` |

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

Route relayer requests through your own backend that injects the API key. This keeps the key out of client-side code.

**Client config:**

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      // your backend proxy — NOT the relayer directly
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

**Next.js App Router** — See [`examples/react-wagmi/src/app/api/relayer/[...path]/route.ts`](./examples/react-wagmi/src/app/api/relayer/%5B...path%5D/route.ts) for a complete implementation. It forwards all methods, strips hop-by-hop headers, and injects the API key server-side. Requires two env vars:

```bash
RELAYER_API_KEY=your-api-key
RELAYER_URL_TESTNET=https://relayer.testnet.zama.org
RELAYER_URL_MAINNET=https://relayer.mainnet.zama.org
```

**Express** — Minimal middleware:

```ts
import type { RequestHandler } from "express";

const RELAYER_URLS: Record<string, string | undefined> = {
  "11155111": process.env.RELAYER_URL_TESTNET,
  "1": process.env.RELAYER_URL_MAINNET,
};

export function relayerProxy(): RequestHandler {
  const apiKey = process.env.RELAYER_API_KEY!;

  return async (req, res) => {
    const chainId = req.params.chainId;
    const upstream = RELAYER_URLS[chainId];
    if (!upstream) return res.status(400).send("Unsupported chain");

    const path = req.path.replace(/^\/api\/relayer\/\d+\/?/, "");
    const url = new URL(path, upstream.endsWith("/") ? upstream : `${upstream}/`);
    url.search = new URLSearchParams(req.query as Record<string, string>).toString();

    const headers: Record<string, string> = {
      "content-type": req.headers["content-type"] ?? "application/json",
      "x-api-key": apiKey,
    };
    const csrf = req.headers["x-csrf-token"];
    if (typeof csrf === "string") headers["x-csrf-token"] = csrf;

    const response = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
      // @ts-expect-error: required by the relayer
      duplex: "half",
    });

    res.status(response.status);
    res.set("content-type", response.headers.get("content-type") ?? "application/json");
    res.send(await response.text());
  };
}

// Usage: app.use("/api/relayer/:chainId", relayerProxy());
```

**Option B — Direct API key via transport config**

Pass the API key directly using the `auth` option. Three authentication methods are supported:

```ts
// API key via header (default header: x-api-key)
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
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

| Storage             | Use Case                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| `indexedDBStorage`  | Browser apps — persists across page reloads and sessions                         |
| `memoryStorage`     | Tests, scripts, throwaway sessions                                               |
| `asyncLocalStorage` | Node.js servers — isolate credentials per request                                |
| Custom              | Implement `GenericStringStorage` (3 methods: `getItem`, `setItem`, `removeItem`) |

### 5. Token Operations

```ts
const token = sdk.createToken("0xEncryptedERC20Address");

// Shield: public ERC-20 → confidential
await token.shield(1000n);
await token.shieldETH(1000n); // for native ETH wrappers

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
  signTypedData(typedData: EIP712TypedData): Promise<Hex>;
  writeContract(config: ContractCallConfig): Promise<Hex>;
  readContract(config: ContractCallConfig): Promise<unknown>;
  waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt>;
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

All SDK errors extend `ZamaError`. Use `instanceof` to catch specific error types:

```ts
import {
  ZamaError,
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
  if (error instanceof ZamaError) {
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

### `matchZamaError`

For cleaner error handling without `instanceof` chains, use `matchZamaError`:

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve in wallet"),
  ENCRYPTION_FAILED: () => toast("Encryption failed — try again"),
  TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
  _: () => toast("Something went wrong"),
});
```

## Migration from `wrap`/`wrapETH`

The `wrap` and `wrapETH` methods on `Token` have been renamed to `shield` and `shieldETH`. The `TokenSDK` class is now `ZamaSDK`, and `TokenError` is now `ZamaError`.

| Before                                      | After                     |
| ------------------------------------------- | ------------------------- |
| `new TokenSDK(...)`                         | `new ZamaSDK(...)`        |
| `token.wrap(amount)`                        | `token.shield(amount)`    |
| `token.wrapETH(amount)`                     | `token.shieldETH(amount)` |
| `TokenError`                                | `ZamaError`               |
| `useWrap(...)` (react-sdk provider hook)    | `useShield(...)`          |
| `useWrapETH(...)` (react-sdk provider hook) | `useShieldETH(...)`       |

Write methods now return `TransactionResult` (`{ txHash, receipt }`) instead of a bare transaction hash.

The low-level contract call builders (`wrapContract`, `wrapETHContract`) and library-adapter hooks (`useShield`/`useShieldETH` in viem/ethers/wagmi sub-paths) retain the on-chain naming since they map directly to smart contract functions.

## Smart Accounts / Account Abstraction

The SDK supports smart accounts when using wagmi with a compatible connector.

**EIP-7702** — Accounts sign standard ECDSA and submit standard transactions. Expected to work without modification.

**ERC-4337 (bundler / UserOperations)** — Two things to verify:

1. **Transaction hashes** — `unshield()` and `resumeUnshield()` call `waitForTransactionReceipt(txHash)` and parse the `UnwrapRequested` event from the receipt. If your bundler returns a `userOpHash` instead of a standard `txHash`, receipt lookup will fail. The `WagmiSigner` detects this and throws a `TransactionRevertedError` with a descriptive message. Confirm your connector resolves to a standard transaction hash.

2. **EIP-712 signatures** — FHE credential authorization uses `signTypedData`. Wagmi handles ERC-1271 validation at the library level, but the Zama relayer must also support your account's signature scheme. Contact Zama to confirm ERC-1271 support for non-ECDSA signers (passkeys, multisig).

## Security

### WASM bundle integrity

`RelayerWeb` loads its FHE WASM bundle from `cdn.zama.org`. Before execution, the SDK computes a SHA-384 digest of the fetched payload and compares it to a pinned hash compiled into the library. If they don't match, initialization fails with a clear error. This is enabled by default; disable it only in test environments:

```ts
const relayer = new RelayerWeb({
  // ...transports
  security: {
    integrityCheck: false, // default: true
  },
});
```

### Credential storage model

FHE decrypt credentials (a keypair + EIP-712 wallet signature) are cached so users aren't prompted on every decrypt. Before writing to storage, the SDK encrypts the private key with AES-256-GCM. The encryption key is derived via PBKDF2 (600 000 iterations, SHA-256) from the wallet signature — a secret known only to the wallet holder.

What's stored:

| Field                 | Plaintext? | Notes                                            |
| --------------------- | ---------- | ------------------------------------------------ |
| `publicKey`           | Yes        | Needed by the relayer to create decrypt requests |
| `signature`           | Yes        | EIP-712 authorization, already visible on-chain  |
| `contractAddresses`   | Yes        | Token addresses covered by the credential        |
| `startTimestamp`      | Yes        | Credential validity start                        |
| `durationDays`        | Yes        | Credential validity window                       |
| `encryptedPrivateKey` | No         | AES-256-GCM encrypted, IV stored alongside       |

Storage keys are truncated SHA-256 hashes of the wallet address — the raw address is never written to the store.

### CSP headers

The Web Worker loads WASM from CDN and executes it. Your Content Security Policy must allow:

- `worker-src blob:` — workers are created from blob URLs
- `script-src 'wasm-unsafe-eval'` — required for WASM execution
- `connect-src https://cdn.zama.org` — CDN fetch for the WASM bundle

### CSRF protection

For browser apps, `RelayerWeb` supports CSRF tokens injected into relayer requests:

```ts
const relayer = new RelayerWeb({
  // ...transports
  security: {
    getCsrfToken: () => document.cookie.match(/csrf=(\w+)/)?.[1] ?? "",
  },
});
```

The token is refreshed before each encrypt/decrypt call.

## Troubleshooting

| Symptom                                         | Root Cause                                  | Fix                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SigningRejectedError` on every decrypt         | Wallet rejected the EIP-712 signature       | Ensure the wallet supports `eth_signTypedData_v4`. Some hardware wallets require a firmware update.                            |
| Balance stuck at `undefined`                    | Encrypted handle is `0x000...` (no balance) | Check that the user has shielded tokens first. A zero handle means nothing to decrypt.                                         |
| `EncryptionFailedError`                         | Web Worker failed to load WASM bundle       | Check CSP headers — the worker loads WASM from a CDN. Ensure `wasm-unsafe-eval` is allowed.                                    |
| `DecryptionFailedError` after page reload       | Unshield interrupted mid-flow               | Use `loadPendingUnshield()` on mount to detect and `resumeUnshield()` to complete the finalize step.                           |
| Duplicate wallet popups                         | Credentials not cached or expired           | Call `useAuthorizeAll(tokenAddresses)` once on load to batch-authorize all tokens in a single signature.                       |
| `TransactionRevertedError` on unshield finalize | Unwrap event not found or already finalized | Check the unwrap tx hash — if the tx was already finalized, clear the pending state with `clearPendingUnshield()`.             |
| Balance not updating after transfer             | Handle polling interval too long            | Mutation hooks auto-invalidate caches, but if using direct contract calls, manually invalidate `confidentialBalanceQueryKeys`. |
| `"Cannot find module @zama-fhe/sdk"`            | Missing or unbuilt dependency               | Run `pnpm build` from the monorepo root — `react-sdk` depends on built `sdk` output.                                           |
| React hydration mismatch                        | Server tried to render FHE hooks            | Add `"use client"` directive to any component using SDK hooks. FHE operations require browser APIs.                            |
| `RelayerRequestFailedError`                     | Relayer URL unreachable or auth missing     | Verify `relayerUrl` in transport config. If using API key auth, check the `auth` option is set correctly.                      |

## Development

### Prerequisites

- Node.js >= 22
- pnpm >= 10

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build                  # Build all (sdk first, then react-sdk)
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

## Release Process

This repository uses [semantic-release](https://semantic-release.gitbook.io/semantic-release/) as the release mechanism.

- `@zama-fhe/sdk` and `@zama-fhe/react-sdk` release in lockstep and always share the same version.
- `main` publishes stable releases to npm `latest` (for example `1.4.0`).
- `prerelease` publishes prereleases to npm `alpha` (for example `1.5.0-alpha.2`).
- Versions are auto-calculated from Conventional Commit messages on both release branches.
- PR titles must follow Conventional Commits because squash merges use PR titles as commit messages.
- On pushes to either release branch, the workflow publishes to npm and creates GitHub releases/tags automatically.
- Publishing uses npm trusted publishing (OIDC) from GitHub Actions (no npm token-based auth).

Install examples:

- Stable: `npm i @zama-fhe/sdk`
- Prerelease: `npm i @zama-fhe/sdk@alpha`

Release prerequisites:

- Branch protection on `main` should require both `Vitest` and `Playwright`.
- Branch protection on `prerelease` should require the same checks as `main`.
- Maintainers must configure npm trusted publishers for both `@zama-fhe/sdk` and `@zama-fhe/react-sdk` using this repository and `release.yml`.

## License

[BSD-3-Clause-Clear](./LICENSE)
