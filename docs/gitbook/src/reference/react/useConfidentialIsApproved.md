---
title: useConfidentialIsApproved
description: Check if a spender is approved as operator for your confidential tokens.
---

# useConfidentialIsApproved

Check if a spender is approved as operator for your confidential tokens.

## Import

```ts
import { useConfidentialIsApproved } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ApprovalStatus.tsx" %}

```tsx
import { useConfidentialIsApproved } from "@zama-fhe/react-sdk";

function ApprovalStatus({ tokenAddress, spender }: { tokenAddress: Address; spender: Address }) {
  const { data: isApproved, isLoading } = useConfidentialIsApproved({
    tokenAddress,
    spender,
  });

  if (isLoading) return <span>Checking approval...</span>;
  return <span>{isApproved ? "Approved" : "Not approved"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { data: isApproved } = useConfidentialIsApproved({
  tokenAddress: "0xToken",
  spender: "0xDEX",
});
```

### spender

`Address`

Address of the operator to check.

```ts
const { data: isApproved } = useConfidentialIsApproved({
  tokenAddress: "0xToken",
  spender: "0xDEX",
});
```

## Return Type

`data` is `boolean` — `true` if the spender has an active approval, `false` otherwise.

{% include ".gitbook/includes/query-result.md" %}

## Suspense

Use `useConfidentialIsApprovedSuspense` inside a `<Suspense>` boundary. The hook throws a promise while loading, so `data` is always defined.

```tsx
import { useConfidentialIsApprovedSuspense } from "@zama-fhe/react-sdk";
import { Suspense } from "react";

function ApprovalCheck({ tokenAddress, spender }: Props) {
  const { data: isApproved } = useConfidentialIsApprovedSuspense({
    tokenAddress,
    spender,
  });

  // data is always defined — no loading state needed
  return <span>{isApproved ? "Approved" : "Not approved"}</span>;
}

function App() {
  return (
    <Suspense fallback={<span>Loading...</span>}>
      <ApprovalCheck tokenAddress="0xToken" spender="0xDEX" />
    </Suspense>
  );
}
```

## Related

- [`useConfidentialApprove`](/reference/react/useConfidentialApprove) — approve an operator
- [`Token.isApproved()`](/reference/sdk/Token#isapproved) — imperative equivalent on the SDK class
