---
title: EthersSigner
description: Signer adapter that wraps ethers providers and signers for the SDK.
---

# EthersSigner

Signer adapter that wraps ethers providers and signers for the SDK. Implements [GenericSigner](/reference/sdk/GenericSigner).

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
import { ethers } from "ethers";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const signer = new EthersSigner({ signer: wallet });
```

{% endtab %}
{% tab title="Read-only" %}

```ts
import { ethers } from "ethers";
import { EthersSigner } from "@zama-fhe/sdk/ethers";

const provider = new ethers.JsonRpcProvider(rpcUrl);

const signer = new EthersSigner({ provider });
```

{% endtab %}
{% endtabs %}

## Constructor

Pass exactly one of the three parameters below. The SDK infers the mode from which key is present.

### ethereum

`EIP1193Provider`

Raw EIP-1193 provider from the browser wallet (e.g. `window.ethereum`). Enables `subscribe()` for automatic session revocation on disconnect and account change.

```ts
const signer = new EthersSigner({
  ethereum: window.ethereum!,
});
```

---

### signer

`ethers.Signer | undefined`

Ethers signer for server-side or scripted use. `subscribe()` is not available in this mode.

```ts
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const signer = new EthersSigner({
  signer: wallet,
});
```

---

### provider

`ethers.Provider | undefined`

Ethers provider for read-only chain access. Signing methods throw at runtime.

```ts
const provider = new ethers.JsonRpcProvider(rpcUrl);

const signer = new EthersSigner({
  provider,
});
```

## Methods

All methods are inherited from [GenericSigner](/reference/sdk/GenericSigner).

| Method                        | Browser | Node.js | Read-only |
| ----------------------------- | ------- | ------- | --------- |
| `getChainId()`                | Works   | Works   | Works     |
| `getAddress()`                | Works   | Works   | Throws    |
| `signTypedData()`             | Works   | Works   | Throws    |
| `writeContract()`             | Works   | Works   | Throws    |
| `readContract()`              | Works   | Works   | Works     |
| `waitForTransactionReceipt()` | Works   | Works   | Works     |
| `subscribe()`                 | Works   | N/A     | N/A       |

{% hint style="info" %}
Only the browser mode (passing `ethereum`) supports `subscribe()`. In Node.js mode, wire wallet events manually to `sdk.revokeSession()` if needed.
{% endhint %}

## Related

- [GenericSigner](/reference/sdk/GenericSigner) -- interface this class implements
- [ViemSigner](/reference/sdk/ViemSigner) -- viem alternative
- [WagmiSigner](/reference/sdk/WagmiSigner) -- React adapter with auto-revoke
- [Configuration guide](/guides/configuration) -- full setup walkthrough
