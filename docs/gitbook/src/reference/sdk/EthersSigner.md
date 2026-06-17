---
title: EthersSigner
description: Signer adapter that wraps an ethers Signer or EIP-1193 source for wallet operations.
---

# EthersSigner

Signer adapter that wraps an ethers `Signer` or EIP-1193 source for wallet operations. Implements [GenericSigner](./GenericSigner.md).

## Import

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";
```

## Usage

{% tabs %}
{% tab title="Browser" %}

```ts
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const signer = new EthersSigner({ ethereum: window.ethereum! });
```

{% endtab %}
{% tab title="Node.js" %}

```ts
import { Wallet, JsonRpcProvider } from "ethers";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);

const signer = new EthersSigner({ signer: wallet });
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
You rarely need to instantiate `EthersSigner` directly. The ethers `createConfig` builds one from the configuration you pass. Use this class when constructing `ZamaSDK` manually or when using the generic `createConfig`.
{% endhint %}

## Constructor

Pass exactly one of the two parameters below.

### ethereum

`EIP1193Provider`

Raw EIP-1193 provider from the browser wallet (e.g. `window.ethereum`). Enables automatic credential cleanup on disconnect and account change.

```ts
const signer = new EthersSigner({
  ethereum: window.ethereum!,
});
```

---

### signer

`ethers.Signer`

Ethers signer for server-side or scripted use. `subscribe()` is not available in this mode.

```ts
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);

const signer = new EthersSigner({
  signer: wallet,
});
```

## Methods

All methods are inherited from [GenericSigner](./GenericSigner.md).

| Method                   | Browser | Node.js |
| ------------------------ | ------- | ------- |
| `walletAccount` store    | Works   | Works   |
| `requireWalletAccount()` | Works   | Works   |
| `signTypedData()`        | Works   | Works   |
| `writeContract()`        | Works   | Works   |

{% hint style="info" %}
Only the browser mode (passing `ethereum`) emits wallet account transitions. In Node.js mode, credentials are not automatically cleared on wallet changes.
{% endhint %}

## Related

- [GenericSigner](./GenericSigner.md) -- interface this class implements
- [EthersProvider](./EthersProvider.md) -- companion provider adapter
- [ViemSigner](./ViemSigner.md) -- viem alternative
- [Configuration guide](../../guides/configuration.md) -- full setup walkthrough
