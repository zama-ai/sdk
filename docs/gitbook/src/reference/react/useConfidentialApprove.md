---
title: useConfidentialApprove
description: Approve an operator to act on your confidential tokens.
---

# useConfidentialApprove

Approve an operator to act on your confidential tokens (e.g. a DEX or multisig).

## Import

```ts
import { useConfidentialApprove } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ApproveOperator.tsx" %}

```tsx
import { useConfidentialApprove } from "@zama-fhe/react-sdk";

function ApproveOperator({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { mutateAsync: approve, isPending } = useConfidentialApprove({ tokenAddress });

  const handleApprove = async () => {
    const txHash = await approve({ spender: "0xDEX" });
    console.log("Approved:", txHash);
  };

  return (
    <button onClick={handleApprove} disabled={isPending}>
      {isPending ? "Approving..." : "Approve DEX"}
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
const { mutateAsync: approve } = useConfidentialApprove({
  tokenAddress: "0xToken",
});
```

## Mutation variables

### spender

`Address`

Address of the operator to approve.

```ts
await approve({
  spender: "0xDEX",
});
```

---

### until

`number` (optional)

Unix timestamp (seconds) when the approval expires. Defaults to 1 hour from now.

```ts
const oneDay = Math.floor(Date.now() / 1000) + 86_400;

await approve({
  spender: "0xDEX",
  until: oneDay,
});
```

## Return type

The mutation resolves with a transaction hash (`Hex`).

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useConfidentialIsApproved`](/reference/react/useConfidentialIsApproved) — check if a spender is currently approved
- [`useConfidentialTransferFrom`](/reference/react/useConfidentialTransferFrom) — operator transfer using an existing approval
- [`Token.approve()`](/reference/sdk/Token#approve) — imperative equivalent on the SDK class
