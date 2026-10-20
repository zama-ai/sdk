---
title: ViemSigner
description: Signer adapter that wraps a viem WalletClient for wallet operations.
---

# ViemSigner

Signer adapter that wraps a viem `WalletClient` for wallet operations. Implements [GenericSigner](./GenericSigner.md).

## Import

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

## Usage

```ts
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum!) });

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
const signer = new ViemSigner({ walletClient });
```

---

### ethereum

`EIP1193Provider | undefined`

Raw EIP-1193 provider for wallet lifecycle event subscriptions. When provided, the signer emits wallet account transitions on disconnect, account change, and chain change, which the SDK uses to switch the relayer chain and to refresh React queries. Credentials are not cleared on these events unless `clearCredentialsOnWalletChange` is enabled. Omit if you handle lifecycle events manually.

```ts
const signer = new ViemSigner({ walletClient, ethereum: window.ethereum });
```

## Methods

All methods are inherited from [GenericSigner](./GenericSigner.md).

| Method                   | Behavior              |
| ------------------------ | --------------------- |
| `walletAccount` store    | Sync observable store |
| `requireWalletAccount()` | From wallet client    |
| `signTypedData()`        | Via wallet client     |
| `writeContract()`        | Via wallet client     |

{% hint style="info" %}
Wallet account transitions are only emitted when you pass the `ethereum` option. Without it, the SDK still works, but it never observes an account change, so it cannot switch the relayer chain or refresh React queries for you, and the `clearCredentialsOnWalletChange` option has no effect.
{% endhint %}

## Related

- [GenericSigner](./GenericSigner.md) -- interface this class implements
- [ViemProvider](./ViemProvider.md) -- companion provider adapter
- [EthersSigner](./EthersSigner.md) -- ethers alternative
- [Configuration guide](../../guides/configuration.md) -- full setup walkthrough
