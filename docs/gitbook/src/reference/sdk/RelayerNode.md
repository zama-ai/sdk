---
title: node() transport
description: Node.js relayer transport that runs FHE operations through @fhevm/sdk on the calling thread.
---

# `node()` transport

The `node()` transport factory configures a chain to run FHE operations in Node.js. It drives `@fhevm/sdk` directly on the calling thread — the server-side counterpart to [`web()`](./RelayerWeb.md).

## Import

```ts
import { node } from "@zama-fhe/sdk/node";
```

## Usage

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  // Sepolia testnet needs no relayer key; for the mainnet relayer add
  // `auth: { __type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY }` to the chain.
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: node() },
});

const sdk = new ZamaSDK(config);
```

## Parameters

`node()` accepts an optional options object forwarded to `@fhevm/sdk` — per-client tuning such as `batchRpcCalls` (batch RPC requests) and `fheEncryptionKey` (supply a pre-fetched FHE encryption key). Most apps omit it and call `node()` bare; parallelism and FHE-artifact caching are handled internally.

## Return Type

`NodeRelayerConfig` — a relayer config object you assign per chain in `createConfig({ relayers })`. You do not construct or interact with it directly.

## Related

- [`web()` transport](./RelayerWeb.md) — the browser variant, running FHE via bundled WASM
- [`cleartext()` transport](./RelayerCleartext.md) — the development variant, no FHE
- [ZamaSDK](./ZamaSDK.md) — pass the config to the SDK constructor
- [Node.js backend guide](../../guides/node-js-backend.md) — server setup and per-request isolation
- [Configuration guide](../../guides/configuration.md) — authentication and network presets
