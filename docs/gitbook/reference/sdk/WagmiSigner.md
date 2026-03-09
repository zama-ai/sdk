---
title: WagmiSigner
description: React-only signer adapter that wraps a wagmi config with automatic session revocation.
---

# WagmiSigner

React-only signer adapter that wraps a wagmi config with automatic session revocation. Implements [GenericSigner](/reference/sdk/GenericSigner).

## Import

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
```

## Usage

```ts
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { config } from "./wagmi"; // your wagmi config

const signer = new WagmiSigner({ config }); // [!code focus]
```

::: warning
`WagmiSigner` is only available from `@zama-fhe/react-sdk/wagmi`. It is not exported from the base `@zama-fhe/sdk` package.
:::

## Constructor

### config

`WagmiConfig`

Wagmi configuration object created by `createConfig()`. The signer uses it to read chain state, send transactions, and subscribe to connection events.

```ts
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

const config = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
});

const signer = new WagmiSigner({
  config, // [!code focus]
});
```

## Methods

All methods are inherited from [GenericSigner](/reference/sdk/GenericSigner).

### subscribe()

`WagmiSigner` implements the optional `subscribe()` method. It uses wagmi's `watchConnection` internally to detect:

- **Disconnect** -- clears the session signature so the next connection requires a fresh sign.
- **Account change** -- revokes the previous account's session because the EIP-712 signature is address-scoped.

You do not need to wire any events manually. The SDK calls `subscribe()` during initialization and handles cleanup on `terminate()`.

::: tip
Chain switches do **not** trigger revocation. Credentials are keyed by `address + chainId`, so each chain maintains an independent session.
:::

## Related

- [GenericSigner](/reference/sdk/GenericSigner) -- interface this class implements
- [ViemSigner](/reference/sdk/ViemSigner) -- viem alternative (manual lifecycle wiring)
- [EthersSigner](/reference/sdk/EthersSigner) -- ethers alternative
- [Configuration guide](/guides/configuration) -- full setup walkthrough
