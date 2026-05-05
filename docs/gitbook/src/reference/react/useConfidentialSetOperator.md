---
title: useConfidentialSetOperator
description: Approve an operator to act on your confidential tokens.
---

# useConfidentialSetOperator

Approve an operator to act on your confidential tokens (e.g. a DEX or multisig).

## Import

```ts
import { useConfidentialSetOperator } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ApproveOperator.tsx" %}

```tsx
import { useConfidentialSetOperator } from "@zama-fhe/react-sdk";

function ApproveOperator({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: setOperator, isPending } = useConfidentialSetOperator({ tokenAddress });

  const handleApprove = async () => {
    const { txHash } = await setOperator({ operator: "0xDEX" });
    console.log("Operator set:", txHash);
  };

  return (
    <button onClick={handleApprove} disabled={isPending}>
      {isPending ? "Setting operator..." : "Set Operator"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: setOperator } = useConfidentialSetOperator({
  tokenAddress: "0xToken",
});
```

## Mutation variables

### operator

`Address`

Address of the operator to approve.

```ts
await setOperator({
  operator: "0xDEX",
});
```

---

### until

`number | undefined`

Unix timestamp (seconds) when the approval expires. Defaults to 1 hour from now.

```ts
const oneDay = Math.floor(Date.now() / 1000) + 86_400;

await setOperator({
  operator: "0xDEX",
  until: oneDay,
});
```

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }` — the submitted transaction hash and its confirmed on-chain receipt.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useConfidentialIsOperator`](/reference/react/useConfidentialIsOperator) — check if a spender is currently an operator
- [`useConfidentialTransferFrom`](/reference/react/useConfidentialTransferFrom) — operator transfer using an existing approval
- [`Token.setOperator()`](/reference/sdk/Token#setoperator) — imperative equivalent on the SDK class
