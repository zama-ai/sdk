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

`cleartext()` accepts an optional options object forwarded to `@fhevm/sdk` for per-client tuning (`batchRpcCalls`, `fheEncryptionKey`); most apps call it bare. It reads `executorAddress` from the chain definition — the address of the `CleartextFHEVMExecutor` contract that stores plaintext values.

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
