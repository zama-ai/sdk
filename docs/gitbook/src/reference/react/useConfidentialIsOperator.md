---
title: useConfidentialIsOperator
description: Check if a spender is an approved operator for a holder's confidential tokens.
---

# useConfidentialIsOperator

Check if a spender is an approved operator for a holder's confidential tokens.

## Import

```ts
import { useConfidentialIsOperator } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="OperatorStatus.tsx" %}

```tsx
import { useConfidentialIsOperator } from "@zama-fhe/react-sdk";

function OperatorStatus({
  tokenAddress,
  holder,
  spender,
}: {
  tokenAddress: `0x${string}`;
  holder: `0x${string}`;
  spender: `0x${string}`;
}) {
  const { data: isOperator, isLoading } = useConfidentialIsOperator({
    address: tokenAddress,
    holder,
    spender,
  });

  if (isLoading) return <span>Checking operator status...</span>;
  return <span>{isOperator ? "Approved" : "Not approved"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### address

`Address`

Address of the confidential token contract.

### holder

`Address | undefined`

Address of the token holder. The query is disabled while `undefined`.

### spender

`Address | undefined`

Address of the operator to check. The query is disabled while `undefined`.

```ts
const { data: isOperator } = useConfidentialIsOperator({
  address: "0xToken",
  holder: "0xOwner",
  spender: "0xDEX",
});
```

## Return Type

`data` is `boolean` — `true` if the spender has an active approval for the given holder, `false` otherwise.

{% include ".gitbook/includes/query-result.md" %}

## Suspense

Use `useConfidentialIsOperatorSuspense` inside a `<Suspense>` boundary. The hook throws a promise while loading, so `data` is always defined.

```tsx
import { useConfidentialIsOperatorSuspense } from "@zama-fhe/react-sdk";
import { Suspense } from "react";

function OperatorCheck({
  tokenAddress,
  holder,
  spender,
}: {
  tokenAddress: `0x${string}`;
  holder: `0x${string}`;
  spender: `0x${string}`;
}) {
  const { data: isOperator } = useConfidentialIsOperatorSuspense({
    tokenAddress,
    holder,
    spender,
  });

  // data is always defined — no loading state needed
  return <span>{isOperator ? "Approved" : "Not approved"}</span>;
}

function App() {
  return (
    <Suspense fallback={<span>Loading...</span>}>
      <OperatorCheck tokenAddress="0xToken" holder="0xOwner" spender="0xDEX" />
    </Suspense>
  );
}
```

## Related

- [`useConfidentialSetOperator`](./useConfidentialSetOperator.md) — approve an operator
- [`Token.isOperator()`](../sdk/Token.md#isoperator) — imperative equivalent on the SDK class
