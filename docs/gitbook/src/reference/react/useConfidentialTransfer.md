---
title: useConfidentialTransfer
description: Send confidential ERC-20 tokens privately.
---

# useConfidentialTransfer

Send confidential ERC-20 tokens privately. The amount is encrypted client-side before the transaction is submitted on-chain. Automatically invalidates the [`useConfidentialBalance`](/reference/react/useConfidentialBalance) cache on success.

## Import

```ts
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

function SendButton({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
    tokenAddress,
  });

  async function handleSend() {
    const { txHash, receipt } = await transfer({
      to: "0xRecipient",
      amount: 1000n,
    });
    console.log("Confirmed in block", receipt.blockNumber);
  }

  return (
    <button onClick={handleSend} disabled={isPending}>
      {isPending ? "Sending..." : "Send"}
    </button>
  );
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialTransferConfig } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { mutateAsync: transfer } = useConfidentialTransfer({
  tokenAddress: "0xToken",
});
```

{% endtab %}
{% endtabs %}

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

The function passed to `mutate` / `mutateAsync` accepts:

### to

`Address`

Recipient address.

### amount

`bigint`

Number of tokens to transfer (in the token's smallest unit). Encrypted before submission.

### skipBalanceCheck

`boolean` (optional, default `false`)

Skip confidential balance validation before submitting. Useful for smart wallets that cannot produce EIP-712 signatures for balance decryption.

### Progress callbacks

| Callback                           | Fires when                                  |
| ---------------------------------- | ------------------------------------------- |
| `onEncryptComplete()`              | FHE encryption of the amount completes.     |
| `onTransferSubmitted(txHash: Hex)` | Transfer transaction is submitted on-chain. |

```tsx
await transfer({
  to: "0xRecipient",
  amount: 1000n,
  onEncryptComplete: () => updateUI("Encrypted, submitting..."),
  onTransferSubmitted: (txHash) => updateUI(`Submitted: ${txHash}`),
});
```

**Throws:**

- `InsufficientConfidentialBalanceError` -- if the confidential balance is less than `amount` (exposes `requested`, `available`, `token`)
- `BalanceCheckUnavailableError` -- if balance validation is required but decryption is not possible (no cached credentials). Call `allow()` first or use `skipBalanceCheck: true`

## Return type

```ts
import { type UseConfidentialTransferReturnType } from "@zama-fhe/react-sdk";
```

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer variant
- [Transfer Privately guide](/guides/transfer-privately)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
