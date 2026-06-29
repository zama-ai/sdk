---
title: ViemProvider
description: Provider adapter that wraps a viem PublicClient for read-only chain access.
---

# ViemProvider

Provider adapter that wraps a viem `PublicClient` for read-only chain access. Implements [GenericProvider](./GenericProvider.md).

## Import

```ts
import { ViemProvider } from "@zama-fhe/sdk/viem";
```

## Usage

```ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ViemProvider } from "@zama-fhe/sdk/viem";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://sepolia.infura.io/v3/YOUR_KEY"),
});

const provider = new ViemProvider({ publicClient });
```

{% hint style="info" %}
You rarely need to instantiate `ViemProvider` directly. The viem `createConfig` builds one from the `publicClient` you pass. Use this class when constructing `ZamaSDK` manually or when using the generic `createConfig`.
{% endhint %}

## Constructor

### publicClient

`PublicClient`

Viem public client for reading chain data.

```ts
const provider = new ViemProvider({ publicClient });
```

## Methods

All methods are inherited from [GenericProvider](./GenericProvider.md).

## Related

- [GenericProvider](./GenericProvider.md) -- interface this class implements
- [ViemSigner](./ViemSigner.md) -- companion signer adapter
- [EthersProvider](./EthersProvider.md) -- ethers alternative
- [Configuration guide](../../guides/configuration.md) -- full setup walkthrough
