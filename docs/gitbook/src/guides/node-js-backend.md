---
title: Node.js Backend
description: How to use the SDK in a Node.js server environment with worker threads and per-request isolation.
---

# Node.js Backend

The SDK works in Node.js with the same API as in the browser. The main differences are the relayer implementation (native worker threads instead of Web Workers) and storage isolation for concurrent requests.

## Steps

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Import RelayerNode from the `/node` sub-path

The Node.js relayer uses native `worker_threads` instead of a Web Worker. It lives in a separate entry point to avoid pulling browser-only code into your server bundle.

```ts
import { ZamaSDK, SepoliaConfig, memoryStorage } from "@zama-fhe/sdk";
import { RelayerNode, asyncLocalStorage } from "@zama-fhe/sdk/node";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
```

### 3. Configure the relayer with a worker pool

`RelayerNode` spawns a pool of worker threads for FHE operations. Use the `poolSize` option to control parallelism. The default is `min(CPU cores, 4)`.

```ts
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

const signer = new ViemSigner({ walletClient, publicClient });

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  poolSize: 4,
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
    },
  },
});
```

### 4. Choose a storage backend

For scripts and single-user CLIs, `memoryStorage` is the simplest option:

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage: memoryStorage,
});
```

For servers handling multiple users concurrently, use `asyncLocalStorage` instead -- see the next step.

### 5. Isolate per-request state with `asyncLocalStorage`

On a server where each HTTP request belongs to a different user, you need per-request FHE keypair isolation. `asyncLocalStorage` wraps Node.js [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html) to scope storage to the current async context.

```ts
import { asyncLocalStorage } from "@zama-fhe/sdk/node";
import express from "express";

const app = express();

app.post("/api/transfer", (req, res) => {
  asyncLocalStorage.run(async () => {
    // Everything inside this callback has its own isolated storage
    const sdk = new ZamaSDK({ relayer, signer, storage: asyncLocalStorage });
    const token = sdk.createToken("0xTokenAddress");
    await token.confidentialTransfer("0xRecipient", 100n);
    res.json({ ok: true });
  });
});
```

Each call to `asyncLocalStorage.run()` creates a fresh storage scope. Concurrent requests never share FHE keypair state.

### 6. Create tokens and operate

The token API is identical to the browser SDK:

```ts
const token = sdk.createToken("0xEncryptedERC20");

// Shield public tokens into their encrypted form
await token.shield(1000n);

// Transfer confidentially
await token.confidentialTransfer("0xRecipient", 500n);

// Decrypt a balance
const balance = await token.balanceOf();
```

See the [Token Operations](/reference/sdk/Token) reference for the full API.

### 7. Use direct API key auth

In a server environment, you can authenticate with the relayer directly -- there is no browser to leak the key to.

```ts
const transports = {
  [SepoliaConfig.chainId]: {
    ...SepoliaConfig,
    network: "https://sepolia.infura.io/v3/YOUR_KEY",
    auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
  },
};
```

Other auth methods are also available:

```ts
// Cookie-based
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Bearer token
auth: { __type: "BearerToken", token: "your-bearer-token" }
```

### 8. Clean up on shutdown

Terminate the worker pool when your process exits:

```ts
process.on("SIGTERM", () => {
  sdk.terminate();
});
```

## Next steps

- [RelayerNode](/reference/sdk/RelayerNode) -- full constructor options and pool behavior
- [asyncLocalStorage](/reference/sdk/GenericStorage) -- the `GenericStorage` interface it implements
- [Configuration](/guides/configuration) -- authentication options, network presets, and session management
