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

::: code-group

```tsx [component.tsx]
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

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseConfidentialTransferFromParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

::: code-group

```tsx [component.tsx]
const { mutateAsync: transferFrom } = useConfidentialTransferFrom({
  tokenAddress: "0xToken", // [!code focus]
});
```

:::

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

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

::: code-group

```tsx [component.tsx]
await transferFrom({
  from: "0xOwner", // [!code focus]
  to: "0xRecipient", // [!code focus]
  amount: 500n, // [!code focus]
});
```

:::

## Return Type

```ts
import { type UseConfidentialTransferFromReturnType } from "@zama-fhe/react-sdk";
```

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useConfidentialTransfer](/reference/react/useConfidentialTransfer) -- direct transfer (no operator)
- [useConfidentialApprove](/reference/react/useConfidentialApprove) -- grant operator approval
- [Operator Approvals guide](/guides/operator-approvals)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
