---
title: cleartext() transport
description: Development relayer transport that operates in cleartext mode, without FHE, KMS, or gateway dependencies.
---

# `cleartext()` transport

The `cleartext()` transport factory configures a chain to run in cleartext mode for local development. Values are stored as plaintext on-chain via the `CleartextFHEVMExecutor` contract — no FHE, KMS, or gateway infrastructure is involved. It exposes the same API as [`web()`](./RelayerWeb.md) and [`node()`](./RelayerNode.md), so application code is identical across modes.

## Import

```ts
import { cleartext } from "@zama-fhe/sdk";
```

## Usage

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { cleartext } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [hardhat],
  publicClient,
  walletClient,
  relayers: { [hardhat.id]: cleartext() },
});
```

## Parameters

`cleartext()` accepts an optional options object: per-client tuning forwarded to `@fhevm/sdk`, plus request defaults applied to every relayer round-trip on this chain; most apps call it bare. It reads `executorAddress` from the chain definition — the address of the `CleartextFHEVMExecutor` contract that stores plaintext values.

| Option             | Type                                               | Default                                    | Purpose                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batchRpcCalls`    | `boolean`                                          | `false`                                    | Batch the client's on-chain version-resolution reads into one JSON-RPC request instead of issuing them individually.                                                                               |
| `fheEncryptionKey` | `FheEncryptionKeyBytes`                            | none — fetched from the relayer's `keyurl` | A pre-fetched FHE public encryption key — the object `fetchFheEncryptionKeyBytes()` returns — to skip the ~50 MB fetch `@fhevm/sdk` otherwise performs during init.                                |
| `moduleVersions`   | `"auto"` \| `{ tfhe?; kms?; checkCompatibility? }` | `"auto"`                                   | Pin the TFHE/KMS WASM module versions instead of auto-resolving them from the chain's on-chain protocol version.                                                                                   |
| `timeout`          | `number` (ms)                                      | `3_600_000` (1 hour)                       | Maximum time to wait for a relayer **request** — an input-proof generation or a decryption, including its retry/backoff loop, not a single HTTP call. A per-call `timeout` overrides this default. |
| `debug`            | `boolean`                                          | `false`                                    | Emit verbose per-request trace logs for this chain's relayer round-trips to `console.log` — a raw diagnostic switch, separate from any `logger` passed to `createConfig`.                          |

```ts
cleartext({
  batchRpcCalls: true,
  fheEncryptionKey, // reuse a key fetched elsewhere
  moduleVersions: "auto",
  timeout: 60_000,
});
```

{% hint style="warning" %}
The chain must define `executorAddress`, or `createRelayer` throws a `ConfigurationError`. Use a development chain preset that includes it (`hardhat`, `hoodi`) or set it yourself. Production presets (`mainnet`, `sepolia`) do not define it — cleartext mode is for development only.
{% endhint %}

## Return Type

`CleartextRelayerConfig` — a relayer config object you assign per chain in `createConfig({ relayers })`. You do not construct or interact with it directly.

## Related

- [Local Development guide](../../guides/local-development.md) — when and how to use cleartext mode
- [`web()` transport](./RelayerWeb.md) — browser transport with real FHE
- [`node()` transport](./RelayerNode.md) — Node.js transport with real FHE
- [Network Presets](./network-presets.md) — production network configs
