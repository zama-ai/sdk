# Configuration

Every SDK setup has three required pieces and two optional ones:

```ts
const sdk = new ZamaSDK({
  relayer,                       // required — handles encryption & decryption
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
import { RelayerWeb, SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [sepolia.id]: {
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
    [mainnet.id]: {
      relayerUrl: "https://your-app.com/api/relayer/1",
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
import { SepoliaConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  poolSize: 4, // worker threads (defaults to min(CPU cores, 4))
  transports: {
    [SepoliaConfig.chainId]: {
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
    },
  },
});
```

### Network presets

You don't need to figure out contract addresses or relayer URLs. Use the built-in presets and just add your RPC URL. For browser apps, override `relayerUrl` with your proxy; for server-side apps, add `auth` instead:

```ts
import { SepoliaConfig, MainnetConfig } from "@zama-fhe/sdk";

// Browser — proxy through your backend
const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    relayerUrl: "https://your-app.com/api/relayer/11155111",
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
  },
};

// Node.js — auth is safe server-side
const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
    auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY },
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

FHE credentials (a keypair + EIP-712 signature) and decrypted balances are cached so users don't get a wallet popup on every decrypt or a loading spinner on page reload. You choose where to store them:

| Storage             | When to use                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `indexedDBStorage`  | Browser apps — persists across page reloads and sessions                                                 |
| `memoryStorage`     | Tests, scripts, throwaway sessions                                                                       |
| `asyncLocalStorage` | Node.js servers — isolate credentials per request ([example below](#per-request-storage-nodejs-servers)) |
| Custom              | Implement `GenericStringStorage` (3 async methods: `getItem`, `setItem`, `removeItem`)                   |

```ts
import { indexedDBStorage, memoryStorage } from "@zama-fhe/sdk";
```

### Per-request storage (Node.js servers)

For servers where each request has its own user context, use `asyncLocalStorage` from the `/node` sub-path. It uses Node.js [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html) to isolate credentials per request:

```ts
import { asyncLocalStorage } from "@zama-fhe/sdk/node";

app.post("/api/transfer", (req, res) => {
  asyncLocalStorage.run(async () => {
    const sdk = new ZamaSDK({ relayer, signer, storage: asyncLocalStorage });
    // credentials are scoped to this request
    await sdk.createToken("0x...").confidentialTransfer("0x...", 100n);
  });
});
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
      // your backend proxy — NOT the relayer directly
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

Your backend proxy just forwards requests and injects the key:

```bash
RELAYER_API_KEY=your-api-key
RELAYER_URL_TESTNET=https://relayer.testnet.zama.org
RELAYER_URL_MAINNET=https://relayer.mainnet.zama.org
```

```ts
// Express example
const RELAYER_URLS: Record<string, string | undefined> = {
  "11155111": process.env.RELAYER_URL_TESTNET,
  "1": process.env.RELAYER_URL_MAINNET,
};

app.use("/api/relayer/:chainId", async (req, res) => {
  const upstream = RELAYER_URLS[req.params.chainId];
  if (!upstream) return res.status(400).send("Unsupported chain");
  const url = new URL(req.path, upstream);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body);
  const response = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.RELAYER_API_KEY,
    },
    body,
    // @ts-expect-error: required by the relayer
    duplex: "half",
  });
  res.status(response.status).send(await response.text());
});
```

### Option B: Direct API key

For server-side apps or prototypes where exposing the key is acceptable:

```ts
const transports = {
  [sepolia.id]: {
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

## Session management

FHE credentials are stored encrypted at rest. The wallet signature that unlocks them is kept **in memory only** — it's never written to disk. This means:

- On page load, the user must re-sign once to "unlock" their credentials for the session
- Closing the tab (or calling `lock()`) clears the signature from memory
- The encrypted credentials survive across sessions in storage; only the unlock step repeats

### Unlock (pre-authorize for the session)

Prompt the wallet to sign and cache the session signature. Call this early (e.g. after wallet connect) to avoid popups during balance decrypts:

```ts
const token = sdk.createToken("0xTokenAddress");

// Unlock for specific tokens
await token.credentials.unlock(["0xTokenA", "0xTokenB"]);

// Check if session is active
const unlocked = await token.credentials.isUnlocked();
```

### Lock (clear session)

Clear the session signature when the user disconnects or locks their wallet:

```ts
token.credentials.lock();
// Next decrypt will require a fresh wallet signature
```

### Typical flow

```ts
// 1. User connects wallet
const token = sdk.createToken("0xTokenAddress");

// 2. Unlock once for the session
await token.credentials.unlock(["0xTokenAddress"]);

// 3. All decrypts reuse the cached session signature — no popups
const balance = await token.decryptBalance(handle);

// 4. User disconnects
token.credentials.lock();
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

Events include: credential lifecycle (`credentials:loading`, `credentials:created`, `credentials:locked`, `credentials:unlocked`, ...), encryption/decryption timing (`encrypt:start`, `decrypt:end`, ...), transaction confirmations (`transfer:submitted`, `shield:submitted`, ...), and errors.

## Cleanup

Call `terminate()` when you're done with the SDK to clean up the Web Worker or thread pool:

```ts
sdk.terminate();
```
