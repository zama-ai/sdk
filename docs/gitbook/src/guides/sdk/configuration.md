# Configuration

Every SDK setup has three required pieces and two optional ones:

```ts
const sdk = new ZamaSDK({
  relayer,                       // required — FHE encryption/decryption backend
  signer,                        // required — wallet interface
  storage,                       // required — credential persistence
  credentialDurationDays: 1,     // optional (default: 1 day)
  onEvent: (event) => { ... },   // optional — lifecycle events for debugging
});
```

## Relayer

The relayer handles all FHE operations — encrypting amounts before they go on-chain, decrypting balance handles, and managing keypairs. You never call it directly; the SDK uses it internally.

### Browser: `RelayerWeb`

Runs FHE in a Web Worker using WASM loaded from CDN. This is what you'll use in any browser app.

```ts
import { RelayerWeb } from "@zama-fhe/sdk";
import { sepolia, mainnet } from "viem/chains";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
    [mainnet.id]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
  },
});
```

`getChainId` is called lazily — the relayer initializes (or re-initializes) its worker when the chain changes.

**Security options:**

```ts
const relayer = new RelayerWeb({
  // ...transports
  security: {
    // verify SHA-384 of WASM bundle (default: true)
    integrityCheck: true,
    getCsrfToken: () => document.cookie.match(/csrf=(\w+)/)?.[1] ?? "",
  },
});
```

### Node.js: `RelayerNode`

Uses native worker threads instead of a Web Worker. Import from the `/node` sub-path.

```ts
import { RelayerNode } from "@zama-fhe/sdk/node";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  poolSize: 4, // worker threads (defaults to min(CPU cores, 4))
  transports: {
    [11155111]: {
      relayerUrl: "https://relayer.zama.ai",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

### Network presets

You don't need to figure out contract addresses. Use the built-in presets and just add your URLs:

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    relayerUrl: "/api/relayer",
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
  },
  [MainnetConfig.chainId]: {
    ...MainnetConfig,
    relayerUrl: "/api/relayer",
    network: "https://mainnet.infura.io/v3/YOUR_KEY",
  },
};
```

Available presets: `MainnetConfig` (chain 1), `SepoliaConfig` (chain 11155111), `HardhatConfig` (chain 31337).

## Signer

The signer is how the SDK interacts with the user's wallet — signing transactions, reading from contracts, etc. Pick the adapter for your Web3 library:

### viem

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
```

### ethers

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ signer: ethersSigner });
```

### wagmi (React only)

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";

const signer = new WagmiSigner({ config: wagmiConfig });
```

### Custom signer

Implement the `GenericSigner` interface if you're not using viem or ethers:

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

## Storage

FHE credentials (a keypair + EIP-712 signature) are cached so users don't get a wallet popup on every decrypt. You choose where to store them:

| Storage                  | When to use                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `indexedDBStorage`       | Browser apps — persists across page reloads and sessions                               |
| `new IndexedDBStorage()` | Same thing, but you control the instance                                               |
| `new MemoryStorage()`    | Tests, scripts, throwaway sessions                                                     |
| Custom                   | Implement `GenericStringStorage` (3 async methods: `getItem`, `setItem`, `removeItem`) |

```ts
import { indexedDBStorage } from "@zama-fhe/sdk";

// or for Node.js / tests:
import { MemoryStorage } from "@zama-fhe/sdk";
```

## Authentication

The relayer requires an API key. You have two options:

### Option A: Proxy through your backend (recommended)

Keep the API key server-side. Point `relayerUrl` at your own endpoint that adds the key before forwarding to the relayer.

```ts
// Client — no API key exposed
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "/api/relayer", // your backend proxy
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

Your backend proxy just forwards requests and injects the key:

```ts
// Express example
app.use("/api/relayer", async (req, res) => {
  const upstream = process.env.RELAYER_URL;
  const response = await fetch(`${upstream}${req.path}`, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.RELAYER_API_KEY,
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });
  res.status(response.status).send(await response.text());
});
```

### Option B: Direct API key

For server-side apps or prototypes where exposing the key is acceptable:

```ts
const transports = {
  [sepolia.id]: {
    relayerUrl: "https://relayer.zama.ai",
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
    auth: { __type: "ApiKeyHeader", value: "your-api-key" },
  },
};

// Other auth methods:
// auth: { __type: "ApiKeyCookie", value: "your-api-key" }
// auth: { __type: "BearerToken", token: "your-bearer-token" }
```

## Credential duration

FHE decrypt credentials require a wallet signature to create. By default, they're valid for 1 day. You can change this:

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  credentialDurationDays: 7, // re-sign once a week
});

// For high-security apps: require a signature on every decrypt
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  credentialDurationDays: 0,
});
```

## Event listener

For debugging and telemetry, you can listen to SDK lifecycle events. Events never contain sensitive data (no amounts, keys, or proofs).

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  onEvent: ({ type, tokenAddress, ...rest }) => {
    console.debug(`[zama] ${type}`, rest);
  },
});
```

Events include: credential lifecycle (`credentials:loading`, `credentials:created`, ...), encryption/decryption timing (`encrypt:start`, `decrypt:end`, ...), transaction confirmations (`transfer:submitted`, `wrap:submitted`, ...), and errors.

## Cleanup

Call `terminate()` when you're done with the SDK to clean up the Web Worker or thread pool:

```ts
sdk.terminate();
```
