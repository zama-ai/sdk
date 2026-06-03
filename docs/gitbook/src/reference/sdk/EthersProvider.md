---
title: EthersProvider
description: Provider adapter that wraps an ethers Provider or EIP-1193 source for read-only chain access.
---

# EthersProvider

Provider adapter that wraps an ethers `Provider` or EIP-1193 source for read-only chain access. Implements [GenericProvider](/reference/sdk/GenericProvider).

## Import

```ts
import { EthersProvider } from "@zama-fhe/sdk/ethers";
```

## Usage

{% tabs %}
{% tab title="ethers Provider" %}

```ts
import { JsonRpcProvider } from "ethers";
import { EthersProvider } from "@zama-fhe/sdk/ethers";

const ethersProvider = new JsonRpcProvider("https://sepolia.infura.io/v3/YOUR_KEY");
const provider = new EthersProvider({ provider: ethersProvider });
```

{% endtab %}
{% tab title="EIP-1193" %}

```ts
import { EthersProvider } from "@zama-fhe/sdk/ethers";

const provider = new EthersProvider({ ethereum: window.ethereum! });
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
You rarely need to instantiate `EthersProvider` directly. The ethers `createConfig` builds one from the configuration you pass. Use this class when constructing `ZamaSDK` manually or when using the generic `createConfig`.
{% endhint %}

## Constructor

Pass exactly one of the two parameters below.

### provider

`ethers.Provider`

Pre-built ethers provider (e.g. `JsonRpcProvider`, `WebSocketProvider`).

```ts
const provider = new EthersProvider({
  provider: new JsonRpcProvider(rpcUrl),
});
```

---

### ethereum

`EIP1193Provider`

Raw EIP-1193 provider from the browser wallet. The adapter wraps it in a `BrowserProvider` internally.

```ts
const provider = new EthersProvider({
  ethereum: window.ethereum!,
});
```

## Methods

All methods are inherited from [GenericProvider](/reference/sdk/GenericProvider).

## Related

- [GenericProvider](/reference/sdk/GenericProvider) -- interface this class implements
- [EthersSigner](/reference/sdk/EthersSigner) -- companion signer adapter
- [ViemProvider](/reference/sdk/ViemProvider) -- viem alternative
- [Configuration guide](/guides/configuration) -- full setup walkthrough
