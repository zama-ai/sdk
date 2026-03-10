---
title: ViemSigner
description: Signer adapter that wraps viem wallet and public clients for the SDK.
---

# ViemSigner

Signer adapter that wraps viem wallet and public clients for the SDK. Implements [GenericSigner](/reference/sdk/GenericSigner).

## Import

```ts
import { ViemSigner } from "@zama-fhe/sdk/viem";
```

## Usage

{% tabs %}
{% tab title="Full mode" %}

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const walletClient = createWalletClient({
  /* ... */
});
const publicClient = createPublicClient({
  /* ... */
});

const signer = new ViemSigner({ walletClient, publicClient });
```

{% endtab %}
{% tab title="Read-only mode" %}

```ts
import { createPublicClient, http } from "viem";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const publicClient = createPublicClient({
  /* ... */
});

const signer = new ViemSigner({ publicClient });
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
In read-only mode, calling `getAddress`, `signTypedData`, or `writeContract` throws at runtime. Only use read-only mode for chain reads without a connected wallet.
{% endhint %}

## Constructor

### publicClient

`PublicClient`

Viem public client for reading chain data.

```ts
const signer = new ViemSigner({
  publicClient,
});
```

---

### walletClient

`WalletClient | undefined`

Viem wallet client for signing transactions. Omit for read-only mode.

```ts
const signer = new ViemSigner({
  walletClient,
  publicClient,
});
```

### ethereum

`EIP1193Provider | undefined`

Raw EIP-1193 provider for wallet lifecycle event subscriptions. When provided, `subscribe()` listens for disconnect and account changes. Omit if you handle lifecycle events manually.

```ts
const signer = new ViemSigner({
  walletClient,
  publicClient,
  ethereum: window.ethereum,
});
```

## Methods

All methods are inherited from [GenericSigner](/reference/sdk/GenericSigner).

| Method                        | Read-only | Full                        |
| ----------------------------- | --------- | --------------------------- |
| `getChainId()`                | Works     | Works                       |
| `getAddress()`                | Throws    | Works                       |
| `signTypedData()`             | Throws    | Works                       |
| `writeContract()`             | Throws    | Works                       |
| `readContract()`              | Works     | Works                       |
| `waitForTransactionReceipt()` | Works     | Works                       |
| `subscribe()`                 | N/A       | Works (requires `ethereum`) |

{% hint style="info" %}
`subscribe()` is only available when you pass the `ethereum` option. Without it, wire wallet lifecycle events manually to `sdk.revokeSession()`. See the [Configuration guide](/guides/configuration).
{% endhint %}

## Related

- [GenericSigner](/reference/sdk/GenericSigner) -- interface this class implements
- [EthersSigner](/reference/sdk/EthersSigner) -- ethers alternative
- [WagmiSigner](/reference/sdk/WagmiSigner) -- React adapter with auto-revoke
- [Configuration guide](/guides/configuration) -- full setup walkthrough
