---
title: Authentication
description: How to authenticate with the relayer using a backend proxy or a direct API key.
---

# Authentication

The Zama-hosted **mainnet** relayer requires an API key on every request. The **Sepolia testnet** relayer is open — it needs no key, so on testnet you can leave `auth` unset and skip this guide. This page covers the two strategies for the mainnet relayer (or any keyed endpoint): proxying through your backend (recommended for browser apps) and passing the key directly (suitable for server-side apps).

{% hint style="info" %}
Building on Sepolia testnet? You don't need an API key — the `sepolia` preset works out of the box. API keys apply only to the Zama-hosted **mainnet** relayer; see [Relayer API keys](relayer-api-keys.md) to apply for one (or self-host instead).
{% endhint %}

## Steps

### 1. Understand the two options

| Strategy           | Use when                                       | API key location                                   |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| **Backend proxy**  | Browser apps, dApps                            | Server-side only — never sent to the client        |
| **Direct API key** | Node.js scripts, backend services, prototyping | Passed in the `auth` field of the transport config |

Browser apps should always use a proxy. Embedding the API key in client-side code exposes it to anyone inspecting network traffic or your bundle.

Server-side apps (Node.js scripts, backend services) can safely use a direct API key since the code runs in a trusted environment where secrets are not exposed to end users.

### 2. Set up a backend proxy

Create an endpoint that forwards relayer requests and injects the API key. Store your credentials in environment variables:

```bash
RELAYER_API_KEY=your-api-key
```

Here is a minimal Express proxy:

```ts
import express from "express";
import { mainnet, sepolia } from "@zama-fhe/sdk/chains";

const app = express();
app.use(express.json());

// Map chain IDs to their network config
const Configs: Record<number, typeof mainnet> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
};

app.use("/api/relayer/:chainId", async (req, res) => {
  const config = Configs[Number(req.params.chainId)];
  if (!config) {
    res.status(400).send("Unsupported chain");
    return;
  }

  const url = new URL(req.url, config.relayerUrl);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body);

  const response = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.RELAYER_API_KEY!,
    },
    body,
    // @ts-expect-error: required by the relayer
    duplex: "half",
  });

  res.status(response.status).send(await response.text());
});

app.listen(3001);
```

The proxy adds the `x-api-key` header to every forwarded request. Your frontend never sees the key.

You can adapt this pattern to any server framework (Fastify, Hono, Next.js API routes, etc.). The key requirements are:

- Forward the HTTP method, path, and body to the upstream relayer URL
- Inject the `x-api-key` header before forwarding
- Return the upstream response status and body to the client

### 3. Configure the SDK to use your proxy

Point the `relayerUrl` at your backend endpoint instead of the relayer directly:

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { mainnet, sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
  network: "https://mainnet.infura.io/v3/YOUR_KEY",
} as const satisfies FheChain;

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
} as const satisfies FheChain;

const config = createConfig({
  chains: [myMainnet, mySepolia],
  publicClient,
  walletClient,
  storage,
  relayers: {
    [myMainnet.id]: web(),
    [mySepolia.id]: web(),
  },
});

const sdk = new ZamaSDK(config);
```

No `auth` field is needed on the client side — the proxy handles authentication transparently. The SDK sends requests to your proxy URL, and your proxy appends the API key before forwarding to the relayer.

### 4. (Alternative) Use a direct API key for server-side apps

When the SDK runs in a trusted environment (Node.js script, backend service), you can pass the API key directly on the chain definition:

```ts
import { sepolia, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  network: "https://sepolia.infura.io/v3/YOUR_KEY",
  auth: { __type: "ApiKeyHeader" as const, value: process.env.RELAYER_API_KEY! },
} as const satisfies FheChain;
```

Then pass `mySepolia` to `createConfig` — the `auth` field is picked up automatically by the relayer. See the [Node.js backend guide](./node-js-backend.md) for a complete example.

The `auth` field supports multiple methods depending on how your relayer is configured.

### 5. Auth methods reference

The `auth` field accepts three formats. **Which one to use depends on where your relayer lives** — the transport has to match what your relayer (or the auth layer in front of it) expects.

| Method         | How it's sent                   | Use it when                                                                                                              |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ApiKeyHeader` | `x-api-key: key` header         | **Zama-hosted relayer** — required; it only accepts the key in the `x-api-key` header. Also the default for most setups. |
| `ApiKeyCookie` | `x-api-key=key` cookie          | **Behind your own proxy** — authenticate the SDK→proxy hop with a cookie; your proxy then injects `x-api-key` upstream.  |
| `BearerToken`  | `Authorization: Bearer <token>` | **Self-hosted relayer** — only if your own auth layer expects a bearer token.                                            |

{% hint style="warning" %}
Against the **Zama-hosted relayer**, only `ApiKeyHeader` works — requests without the `x-api-key` header are rejected. `BearerToken` and `ApiKeyCookie` are for self-hosted relayers or proxied setups where you control the auth layer.
{% endhint %}

```ts
// Zama-hosted relayer — API key in the x-api-key header (required)
auth: { __type: "ApiKeyHeader", value: "your-api-key" }

// Behind your own proxy — credential carried as a cookie to your proxy
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Self-hosted relayer — only if your auth layer expects a bearer token
auth: { __type: "BearerToken", token: "your-token" }
```

When using `RelayerWeb` with a proxy, you can also add CSRF protection via the `security.getCsrfToken` callback. See the [RelayerWeb reference](../reference/sdk/RelayerWeb.md) for details.

## Next steps

- [Configuration](./configuration.md) — full relayer, signer, and storage setup
- [Shield Tokens](./shield-tokens.md) — start converting public tokens to confidential form
- [RelayerWeb reference](../reference/sdk/RelayerWeb.md) — security options and multi-threading
- [RelayerNode reference](../reference/sdk/RelayerNode.md) — `node()` transport factory
