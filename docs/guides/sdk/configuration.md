# Configuration

## ZamaSDK

Entry point to the SDK. Composes a relayer backend with a signer and storage layer. Acts as a factory for token instances.

```ts
const sdk = new ZamaSDK({
  relayer, // RelayerSDK — either RelayerWeb (browser) or RelayerNode (Node.js)
  signer, // GenericSigner
  storage, // GenericStringStorage
});
```

### `ZamaSDKConfig`

| Field                    | Type                   | Description                                                                                                                           |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `relayer`                | `RelayerSDK`           | Relayer backend (`RelayerWeb` or `RelayerNode` instance)                                                                              |
| `signer`                 | `GenericSigner`        | Wallet signer interface.                                                                                                              |
| `storage`                | `GenericStringStorage` | Credential storage backend.                                                                                                           |
| `credentialDurationDays` | `number`               | Optional. Days FHE credentials remain valid. Default: 1. Set `0` to require a wallet signature on every decrypt (high-security mode). |
| `onEvent`                | `ZamaSDKEventListener` | Optional. Structured event listener for debugging.                                                                                    |

The `relayer`, `signer`, and `storage` properties are public and accessible after construction. Low-level FHE operations (`encrypt`, `userDecrypt`, `publicDecrypt`, `generateKeypair`, etc.) are available via `sdk.relayer`. Call `sdk.terminate()` to clean up resources when done.

## Relayer Backends

The `RelayerSDK` interface defines the FHE operations contract. Two implementations are provided:

| Backend       | Import               | Environment | How it works                               |
| ------------- | -------------------- | ----------- | ------------------------------------------ |
| `RelayerWeb`  | `@zama-fhe/sdk`      | Browser     | Runs WASM in a Web Worker via CDN          |
| `RelayerNode` | `@zama-fhe/sdk/node` | Node.js     | Uses `@zama-fhe/relayer-sdk/node` directly |

You can also implement the `RelayerSDK` interface for custom backends.

### `RelayerWebConfig` (browser)

| Field        | Type                                  | Description                                                                                  |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `getChainId` | `() => Promise<number>`               | Resolve the current chain ID. Called lazily; the worker is re-initialized on chain change.   |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, contract addresses). |
| `security`   | `RelayerWebSecurityConfig`            | Optional. Security options (see below).                                                      |
| `logger`     | `GenericLogger`                       | Optional. Logger for worker lifecycle and request timing.                                    |

#### `RelayerWebSecurityConfig`

| Field            | Type           | Description                                                                                      |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `getCsrfToken`   | `() => string` | Optional. Resolve the CSRF token before each authenticated network request.                      |
| `integrityCheck` | `boolean`      | Optional. Verify SHA-384 integrity of the CDN bundle. Defaults to `true`. Set `false` for tests. |

> **Security note:** `RelayerWeb` loads FHE WASM from a CDN at runtime. The `integrityCheck` option (enabled by default) verifies the SHA-384 hash of the bundle before execution, protecting against CDN compromise or MITM attacks. Only disable it in local development or testing.

### `RelayerNodeConfig` (Node.js)

| Field        | Type                                  | Description                                                                                        |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getChainId` | `() => Promise<number>`               | Resolve the current chain ID. Called lazily; the pool is re-initialized on chain change.           |
| `transports` | `Record<number, FhevmInstanceConfig>` | Chain-specific configs keyed by chain ID (includes relayerUrl, network, auth, contract addresses). |

## Network Preset Configs

Both the main entry (`@zama-fhe/sdk`) and the `/node` sub-path re-export preset configs so you don't need to import from `@zama-fhe/relayer-sdk` directly:

| Config          | Chain ID | Description                         |
| --------------- | -------- | ----------------------------------- |
| `SepoliaConfig` | 11155111 | Sepolia testnet contract addresses. |
| `MainnetConfig` | 1        | Mainnet contract addresses.         |
| `HardhatConfig` | 31337    | Local Hardhat node addresses.       |

Each preset provides contract addresses and default values. Override `relayerUrl` and `network` (RPC URL) for your environment:

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    relayerUrl: "/api/proxy",
    network: "https://sepolia.infura.io/v3/KEY",
  },
  [MainnetConfig.chainId]: {
    ...MainnetConfig,
    relayerUrl: "/api/proxy",
    network: "https://mainnet.infura.io/v3/KEY",
  },
};
```

## Authentication

The relayer requires an API key. There are two approaches:

### Option A — Proxy (recommended for browser apps)

Route relayer requests through your own backend that injects the API key. This keeps the key out of client-side code.

**Client config:**

```ts
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "/api/relayer", // relative path — API key never reaches the client
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

**Express middleware example:**

```ts
import type { RequestHandler } from "express";

export function relayerProxy(): RequestHandler {
  const upstream = process.env.RELAYER_URL!;
  const apiKey = process.env.RELAYER_API_KEY!;

  return async (req, res) => {
    const path = req.path.replace(/^\/api\/relayer\/?/, "");
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
    });

    res.status(response.status);
    res.set("content-type", response.headers.get("content-type") ?? "application/json");
    res.send(await response.text());
  };
}

// Usage: app.use("/api/relayer", relayerProxy());
```

### Option B — Direct API key via transport config

Pass the API key directly using the `auth` option. Three authentication methods are supported:

```ts
// API key via header (default header: x-api-key)
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
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

## Storage

FHE credentials (keypair + EIP-712 signature) need to be persisted so users don't re-sign on every page load:

| Storage            | Use Case                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| `IndexedDBStorage` | Browser production (persistent across sessions)                                  |
| `indexedDBStorage` | Pre-built singleton of `IndexedDBStorage`                                        |
| `MemoryStorage`    | Testing / Node.js scripts (lost on restart)                                      |
| Custom             | Implement `GenericStringStorage` (3 methods: `getItem`, `setItem`, `removeItem`) |

```ts
interface GenericStringStorage {
  getItem(key: string): string | Promise<string | null> | null;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

## GenericSigner Interface

The `GenericSigner` interface has six methods. Any Web3 library can back it.

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

### Built-in Adapters

**viem** — `@zama-fhe/sdk/viem`

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
```

**ethers** — `@zama-fhe/sdk/ethers`

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ signer: ethersSigner });
```

## Structured Event Listener

The `onEvent` callback receives typed events at key lifecycle points. Event payloads never contain sensitive data (amounts, keys, proofs) — only metadata useful for debugging and telemetry.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  onEvent: ({ type, tokenAddress, ...event }) => {
    console.debug(`[Zama] ${type}`, {
      tokenAddress: tokenAddress?.slice(0, 10),
      ...event,
    });
  },
});
```

**Event types:**

| Category               | Events                                                                                                                                                               | Key fields                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Credentials            | `credentials:loading`, `credentials:cached`, `credentials:expired`, `credentials:creating`, `credentials:created`                                                    | `contractAddresses`                                              |
| Encryption             | `encrypt:start`, `encrypt:end`, `encrypt:error`                                                                                                                      | `durationMs` (end/error), `error` (error)                        |
| Decryption             | `decrypt:start`, `decrypt:end`, `decrypt:error`                                                                                                                      | `durationMs` (end/error), `error` (error)                        |
| Transactions           | `transaction:error`                                                                                                                                                  | `operation` (`"transfer"`, `"wrap"`, `"approve"`, etc.), `error` |
| Write confirmations    | `wrap:submitted`, `transfer:submitted`, `transferFrom:submitted`, `approve:submitted`, `approveUnderlying:submitted`, `unwrap:submitted`, `finalizeUnwrap:submitted` | `txHash`                                                         |
| Unshield orchestration | `unshield:phase1_submitted`, `unshield:phase2_started`, `unshield:phase2_submitted`                                                                                  | `txHash`, `operationId`                                          |
