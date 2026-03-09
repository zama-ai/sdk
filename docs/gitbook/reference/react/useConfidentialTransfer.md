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

::: code-group

```tsx [component.tsx]
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

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseConfidentialTransferParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Contract address of the confidential ERC-20 token.

::: code-group

```tsx [component.tsx]
const { mutateAsync: transfer } = useConfidentialTransfer({
  tokenAddress: "0xToken", // [!code focus]
});
```

:::

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

The function passed to `mutate` / `mutateAsync` accepts:

### to

`Address`

Recipient address.

### amount

`bigint`

Number of tokens to transfer (in the token's smallest unit). Encrypted before submission.

::: code-group

```tsx [component.tsx]
await transfer({
  to: "0xRecipient", // [!code focus]
  amount: 1000n, // [!code focus]
});
```

:::

## Return Type

```ts
import { type UseConfidentialTransferReturnType } from "@zama-fhe/react-sdk";
```

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useConfidentialTransferFrom](/reference/react/useConfidentialTransferFrom) -- operator transfer variant
- [Transfer Privately guide](/guides/transfer-privately)
- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- auto-invalidated on success
