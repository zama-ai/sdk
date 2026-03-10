---
title: useUnderlyingAllowance
description: Read the ERC-20 allowance of the underlying public token for the wrapper contract.
---

# useUnderlyingAllowance

Read the ERC-20 allowance of the underlying public token for the wrapper contract. Use this to check whether shielding requires an approval transaction.

## Import

```ts
import { useUnderlyingAllowance } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="AllowanceDisplay.tsx" %}

```tsx
import { useUnderlyingAllowance } from "@zama-fhe/react-sdk";

function AllowanceDisplay({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: allowance, isLoading } = useUnderlyingAllowance({
    tokenAddress,
  });

  if (isLoading) return <span>Loading allowance...</span>;
  return <span>Allowance: {allowance?.toString() ?? "0"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract. The hook reads the underlying ERC-20 allowance granted to this wrapper.

```ts
const { data: allowance } = useUnderlyingAllowance({
  tokenAddress: "0xWrapper",
});
```

---

### owner

`Address` (optional)

Address of the token owner. Defaults to the connected wallet address.

```ts
const { data: allowance } = useUnderlyingAllowance({
  tokenAddress: "0xWrapper",
  owner: "0xOwner",
});
```

### spender

`Address` (optional)

Address of the spender. Defaults to the wrapper contract address.

```ts
const { data: allowance } = useUnderlyingAllowance({
  tokenAddress: "0xWrapper",
  spender: "0xSpender",
});
```

## Return Type

`data` is `bigint` — the current ERC-20 allowance in the token's smallest unit.

{% include ".gitbook/includes/query-result.md" %}

## Suspense

Use `useUnderlyingAllowanceSuspense` inside a `<Suspense>` boundary. The hook throws a promise while loading, so `data` is always defined.

```tsx
import { useUnderlyingAllowanceSuspense } from "@zama-fhe/react-sdk";
import { Suspense } from "react";

function Allowance({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data: allowance } = useUnderlyingAllowanceSuspense({
    tokenAddress,
  });

  // data is always defined — no loading state needed
  return <span>Allowance: {allowance.toString()}</span>;
}

function App() {
  return (
    <Suspense fallback={<span>Loading...</span>}>
      <Allowance tokenAddress="0xWrapper" />
    </Suspense>
  );
}
```

## Related

- [`useShield`](/reference/react/useShield) — shield tokens (handles approval automatically)
- [`zamaQueryKeys.underlyingAllowance`](/reference/react/query-keys) — cache keys for manual invalidation
