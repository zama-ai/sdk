---
title: Node.js backend
description: How to use the SDK in a Node.js server environment with worker threads and per-request isolation.
---

# Node.js backend

The SDK works in Node.js with the same API as in the browser. The main differences are the transport (native worker threads instead of Web Workers) and storage isolation for concurrent requests.

## Steps

### 1. Install packages

```bash
npm install @zama-fhe/sdk viem
```

### 2. Create the config with a `node()` transport

The `node()` transport uses native `worker_threads` for FHE operations. Pass `poolSize` in the second argument to control parallelism (default: `min(CPU cores, 4)`).

```ts
import { createZamaConfig, node, ZamaSDK, memoryStorage } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as sepoliaViem } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: sepoliaViem, transport: http() });
const walletClient = createWalletClient({
  account,
  chain: sepoliaViem,
  transport: http(),
});

const config = createZamaConfig({
  chains: [sepolia],
  viem: { publicClient, walletClient },
  storage: memoryStorage,
  transports: {
    [sepolia.id]: node(
      {
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
        auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
      },
      { poolSize: 4 },
    ),
  },
});

const sdk = new ZamaSDK(config);
```

### 3. Choose a storage backend

For scripts and single-user CLIs, `memoryStorage` is the simplest option (shown above).

For servers handling multiple users concurrently, use `asyncLocalStorage` instead — see the next step.

### 4. Isolate per-request state with `asyncLocalStorage`

On a server where each HTTP request belongs to a different user, you need per-request FHE keypair isolation. `asyncLocalStorage` wraps Node.js [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html) to scope storage to the current async context.

```ts
import { asyncLocalStorage } from "@zama-fhe/sdk/node";
import express from "express";

const app = express();

app.post("/api/transfer", (req, res) => {
  asyncLocalStorage.run(async () => {
    // Everything inside this callback has its own isolated storage
    const config = createZamaConfig({
      chains: [sepolia],
      viem: { publicClient, walletClient },
      storage: asyncLocalStorage,
      transports: {
        [sepolia.id]: node({
          network: "https://sepolia.infura.io/v3/YOUR_KEY",
          auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
        }),
      },
    });
    const sdk = new ZamaSDK(config);
    const token = sdk.createToken("0xTokenAddress");
    await token.confidentialTransfer("0xRecipient", 100n);
    res.json({ ok: true });
  });
});
```

Each call to `asyncLocalStorage.run()` creates a fresh storage scope. Concurrent requests never share FHE keypair state.

### 5. Create tokens and operate

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

### 6. Use direct API key auth

In a server environment, you can authenticate with the relayer directly — there is no browser to leak the key to. Pass `auth` in the chain overrides:

```ts
node({
  auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
});
```

Other auth methods are also available:

```ts
// Cookie-based
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Bearer token
auth: { __type: "BearerToken", token: "your-bearer-token" }
```

### 7. Clean up on shutdown

Terminate the worker pool when your process exits:

```ts
process.on("SIGTERM", () => {
  sdk.terminate();
});
```

## Next steps

- [RelayerNode](/reference/sdk/RelayerNode) -- full constructor options and pool behavior
- [asyncLocalStorage](/reference/sdk/GenericStorage) -- the `GenericStorage` interface it implements
- [Configuration](/guides/configuration) -- chains, transports, authentication, and session management
