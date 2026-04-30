---
title: ViemSigner
description: Signer adapter that wraps a viem WalletClient for wallet operations.
---

# ViemSigner

Signer adapter that wraps a viem `WalletClient` for wallet operations. Implements [GenericSigner](/reference/sdk/GenericSigner).

## Import

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

## Usage

```ts
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const signer = new ViemSigner({ walletClient, ethereum: window.ethereum });
```

{% hint style="info" %}
You rarely need to instantiate `ViemSigner` directly. The viem `createConfig` builds one from the `walletClient` you pass. Use this class when constructing `ZamaSDK` manually or when using the generic `createConfig`.
{% endhint %}

## Constructor

### walletClient

`WalletClient`

Viem wallet client for signing transactions and typed data.

```ts
const signer = new ViemSigner({
  walletClient,
});
```

---

### ethereum

`EIP1193Provider | undefined`

Raw EIP-1193 provider for wallet lifecycle event subscriptions. When provided, `subscribe()` listens for disconnect, account change, and chain change events. Omit if you handle lifecycle events manually.

```ts
const signer = new ViemSigner({
  walletClient,
  ethereum: window.ethereum,
});
```

## Methods

All methods are inherited from [GenericSigner](/reference/sdk/GenericSigner).

| Method            | Behavior                    |
| ----------------- | --------------------------- |
| `getChainId()`    | From wallet client          |
| `getAddress()`    | From wallet client          |
| `signTypedData()` | Via wallet client           |
| `writeContract()` | Via wallet client           |
| `subscribe()`     | Works (requires `ethereum`) |

{% hint style="info" %}
`subscribe()` is only available when you pass the `ethereum` option. Without it, the SDK still works but stale sessions persist until TTL expiry when users switch accounts.
{% endhint %}

## Related

- [GenericSigner](/reference/sdk/GenericSigner) -- interface this class implements
- [ViemProvider](/reference/sdk/ViemProvider) -- companion provider adapter
- [EthersSigner](/reference/sdk/EthersSigner) -- ethers alternative
- [Configuration guide](/guides/configuration) -- full setup walkthrough
