---
title: Authentication
description: How to authenticate with the relayer using a backend proxy or a direct API key.
---

# Authentication

The relayer requires an API key for every request. This guide covers the two authentication strategies: proxying through your backend (recommended for browser apps) and passing the key directly (suitable for server-side apps).

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
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

const app = express();
app.use(express.json());

// Map chain IDs to their network config
const Configs: Record<string, typeof MainnetConfig> = {
  [MainnetConfig.chainId]: MainnetConfig,
  [SepoliaConfig.chainId]: SepoliaConfig,
};

app.use("/api/relayer/:chainId", async (req, res) => {
  const config = Configs[req.params.chainId];
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
import { RelayerWeb, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

No `auth` field is needed on the client side — the proxy handles authentication transparently. The SDK sends requests to your proxy URL, and your proxy appends the API key before forwarding to the relayer.

### 4. (Alternative) Use a direct API key for server-side apps

When the SDK runs in a trusted environment (Node.js script, backend service), you can pass the API key directly in the transport configuration:

```ts
import { SepoliaConfig } from "@zama-fhe/sdk";
import { RelayerNode } from "@zama-fhe/sdk/node";

const relayer = new RelayerNode({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
      auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
    },
  },
});
```

The `auth` field supports multiple methods depending on how your relayer is configured.

### 5. Auth methods reference

The `auth` field accepts three formats:

| Method         | Format                                     | Header sent                 |
| -------------- | ------------------------------------------ | --------------------------- |
| `ApiKeyHeader` | `{ __type: "ApiKeyHeader", value: "key" }` | `x-api-key: key`            |
| `ApiKeyCookie` | `{ __type: "ApiKeyCookie", value: "key" }` | Sets a cookie               |
| `BearerToken`  | `{ __type: "BearerToken", token: "jwt" }`  | `Authorization: Bearer jwt` |

```ts
// API key in a header (most common)
auth: { __type: "ApiKeyHeader", value: "your-api-key" }

// API key in a cookie
auth: { __type: "ApiKeyCookie", value: "your-api-key" }

// Bearer token (e.g. from your own auth system)
auth: { __type: "BearerToken", token: "your-jwt-token" }
```

When using `RelayerWeb` with a proxy, you can also add CSRF protection via the `security.getCsrfToken` callback. See the [RelayerWeb reference](/reference/sdk/RelayerWeb) for details.

## Next steps

- [Configuration](/guides/configuration) — full relayer, signer, and storage setup
- [Shield Tokens](/guides/shield-tokens) — start converting public tokens to confidential form
- [RelayerWeb reference](/reference/sdk/RelayerWeb) — security options and multi-threading
- [RelayerNode reference](/reference/sdk/RelayerNode) — Node.js-specific configuration
