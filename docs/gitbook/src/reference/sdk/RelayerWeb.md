---
title: web() transport
description: Browser relayer transport that runs FHE operations in a Web Worker via WASM.
---

# `web()` transport

The `web()` transport factory configures a chain to run FHE operations in the browser. It drives `@fhevm/sdk`, which handles encryption, decryption, and transport key pair management in a Web Worker via WASM.

## Import

```ts
import { web } from "@zama-fhe/sdk/web";
```

## Usage

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: web() },
});
```

## Parameters

`web()` takes no parameters. WASM execution and FHE-artifact caching are handled internally by `@fhevm/sdk` — no special cross-origin headers are required.

## Return Type

`WebRelayerConfig` — a relayer config object you assign per chain in `createConfig({ relayers })`. You do not construct or interact with it directly.

## Related

- [`node()` transport](./RelayerNode.md) — the Node.js variant, running FHE on the calling thread
- [`cleartext()` transport](./RelayerCleartext.md) — the development variant, no FHE
- [ZamaSDK](./ZamaSDK.md) — pass the config to the SDK constructor
- [Configuration guide](../../guides/configuration.md) — authentication and network presets
