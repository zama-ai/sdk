---
title: useConfidentialTransferFrom
description: Transfer confidential tokens on behalf of an owner who approved you as an operator.
---

# useConfidentialTransferFrom

Transfer confidential tokens on behalf of an owner who approved you as an operator. The sender must have been granted approval via [`useConfidentialSetOperator`](./useConfidentialSetOperator.md) before calling this hook. Automatically invalidates the [`useConfidentialBalance`](./useConfidentialBalance.md) cache on success.

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
  const { mutateAsync: transferFrom, isPending } = useConfidentialTransferFrom(tokenAddress);

  async function handleTransfer() {
    const { txHash } = await transferFrom({
      from: "0xOwner",
      to: "0xRecipient",
      amount: 500n,
    });
    console.log("Transfer confirmed:", txHash);
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
// config.ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// In your app layout:
// <ZamaProvider config={zamaConfig}>
//   <App />
// </ZamaProvider>
```

{% endtab %}
{% endtabs %}

## Parameters

### address

`Address`

Contract address of the confidential token. Passed positionally as the first argument.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { mutateAsync: transferFrom } = useConfidentialTransferFrom("0xToken");
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

Number of tokens to transfer (in the token's base units). Encrypted before submission.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
await transferFrom({ from: "0xOwner", to: "0xRecipient", amount: 500n });
```

{% endtab %}
{% endtabs %}

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useConfidentialTransfer](./useConfidentialTransfer.md) -- direct transfer (no operator)
- [useConfidentialSetOperator](./useConfidentialSetOperator.md) -- grant operator approval
- [Operator Approvals guide](../../guides/operator-approvals.md)
- [useConfidentialBalance](./useConfidentialBalance.md) -- auto-invalidated on success
