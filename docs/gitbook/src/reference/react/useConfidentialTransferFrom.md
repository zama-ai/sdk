---
title: useConfidentialTransferFrom
description: Transfer confidential tokens on behalf of an owner who approved you as an operator.
---

# useConfidentialTransferFrom

Transfer confidential tokens on behalf of an owner who approved you as an operator. The sender must have been granted approval via [`useConfidentialApprove`](/reference/react/useConfidentialApprove) before calling this hook. Automatically invalidates the [`useConfidentialBalance`](/reference/react/useConfidentialBalance) cache on success.

## Import

```ts
import { useConfidentialTransferFrom } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useConfidentialTransferFrom } from "@zama-fhe/react-sdk";

function OperatorTransfer({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: transferFrom, isPending } = useConfidentialTransferFrom({
    tokenAddress,
  });

  async function handleTransfer() {
    const { txHash, receipt } = await transferFrom({
      from: "0xOwner",
      to: "0xRecipient",
      amount: 500n,
    });
    console.log("Confirmed in block", receipt.blockNumber);
  }

  return (
    <button onClick={handleTransfer} disabled={isPending}>
      {isPending ? "Transferring..." : "Transfer"}
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
import { type UseConfidentialTransferFromParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { mutateAsync: transferFrom } = useConfidentialTransferFrom({
  tokenAddress: "0xToken",
});
```

{% endtab %}
{% endtabs %}

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

The function passed to `mutate` / `mutateAsync` accepts:

### from

`Address`

Owner address whose tokens are being transferred. The connected wallet must have operator approval from this address.

### to

`Address`

Recipient address.

### amount

`bigint`

Number of tokens to transfer (in the token's smallest unit). Encrypted before submission.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
await transferFrom({
  from: "0xOwner",
  to: "0xRecipient",
  amount: 500n,
});
```

{% endtab %}
{% endtabs %}

## Return type

```ts
import { type UseConfidentialTransferFromReturnType } from "@zama-fhe/react-sdk";
```

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransfer](/reference/react/useConfidentialTransfer) -- direct transfer (no operator)
- [useConfidentialApprove](/reference/react/useConfidentialApprove) -- grant operator approval
- [Operator Approvals guide](/guides/operator-approvals)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
