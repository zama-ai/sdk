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

`node()` accepts an optional options object: per-client tuning forwarded to `@fhevm/sdk`, plus request defaults applied to every relayer round-trip on this chain. Most apps omit it and call `node()` bare; parallelism and FHE-artifact caching are handled internally.

| Option             | Type                                               | Default                                    | Purpose                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batchRpcCalls`    | `boolean`                                          | `false`                                    | Batch the client's on-chain version-resolution reads into one JSON-RPC request instead of issuing them individually.                                                                               |
| `fheEncryptionKey` | `FheEncryptionKeyBytes`                            | none — fetched from the relayer's `keyurl` | A pre-fetched FHE public encryption key — the object `fetchFheEncryptionKeyBytes()` returns — to skip the ~50 MB fetch `@fhevm/sdk` otherwise performs during init.                                |
| `moduleVersions`   | `"auto"` \| `{ tfhe?; kms?; checkCompatibility? }` | `"auto"`                                   | Pin the TFHE/KMS WASM module versions instead of auto-resolving them from the chain's on-chain protocol version.                                                                                   |
| `timeout`          | `number` (ms)                                      | `3_600_000` (1 hour)                       | Maximum time to wait for a relayer **request** — an input-proof generation or a decryption, including its retry/backoff loop, not a single HTTP call. A per-call `timeout` overrides this default. |
| `debug`            | `boolean`                                          | `false`                                    | Emit verbose per-request trace logs for this chain's relayer round-trips to `console.log` — a raw diagnostic switch, separate from any `logger` passed to `createConfig`.                          |

```ts
node({
  batchRpcCalls: true,
  fheEncryptionKey, // reuse a key fetched elsewhere
  moduleVersions: "auto",
  timeout: 60_000,
});
```

`timeout` bounds only the relayer request itself, not `@fhevm/sdk`'s one-time per-client init phase (protocol-version resolution, the FHE key fetch, WASM module load), which runs before the first request and can hang independently of this value.

## Return Type

`NodeRelayerConfig` — a relayer config object you assign per chain in `createConfig({ relayers })`. You do not construct or interact with it directly.

## Related

- [`web()` transport](./RelayerWeb.md) — the browser variant, running FHE via bundled WASM
- [`cleartext()` transport](./RelayerCleartext.md) — the development variant, no FHE
- [ZamaSDK](./ZamaSDK.md) — pass the config to the SDK constructor
- [Node.js backend guide](../../guides/node-js-backend.md) — server setup and per-request isolation
- [Configuration guide](../../guides/configuration.md) — authentication and network presets
