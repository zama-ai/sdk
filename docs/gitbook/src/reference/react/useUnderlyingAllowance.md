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

function AllowanceDisplay({
  wrapperAddress,
  owner,
}: {
  wrapperAddress: `0x${string}`;
  owner: `0x${string}` | undefined;
}) {
  const { data: allowance, isLoading } = useUnderlyingAllowance({ address: wrapperAddress, owner });

  if (isLoading) return <span>Loading allowance...</span>;
  return <span>Allowance: {allowance?.toString() ?? "0"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### address

`Address`

Address of the confidential wrapper contract. The hook reads the underlying ERC-20 allowance granted by `owner` to this wrapper.

```ts
const { data: allowance } = useUnderlyingAllowance({ address: "0xWrapper", owner: "0xOwner" });
```

---

### owner

`Address | undefined`

Address whose allowance to read. The query is disabled while `undefined`.

```ts
const { data: allowance } = useUnderlyingAllowance({ address: "0xWrapper", owner: "0xOwner" });
```

## Return Type

`data` is `bigint` — the current ERC-20 allowance in the token's base units.

{% include ".gitbook/includes/query-result.md" %}

## Suspense

Use `useUnderlyingAllowanceSuspense` inside a `<Suspense>` boundary. The hook throws a promise while loading, so `data` is always defined.

```tsx
import { useUnderlyingAllowanceSuspense } from "@zama-fhe/react-sdk";
import { Suspense } from "react";

function Allowance({
  wrapperAddress,
  owner,
}: {
  wrapperAddress: `0x${string}`;
  owner: `0x${string}`;
}) {
  const { data: allowance } = useUnderlyingAllowanceSuspense({ address: wrapperAddress, owner });

  // data is always defined — no loading state needed
  return <span>Allowance: {allowance.toString()}</span>;
}

function App() {
  return (
    <Suspense fallback={<span>Loading...</span>}>
      <Allowance wrapperAddress="0xWrapper" owner="0xOwner" />
    </Suspense>
  );
}
```

## Related

- [`useShield`](./useShield.md) — shield tokens (handles approval automatically)
- [`useApproveUnderlying`](./useApproveUnderlying.md) — the write counterpart; approve the wrapper to spend the underlying ERC-20
- [`zamaQueryKeys.underlyingAllowance`](./query-keys.md) — cache keys for manual invalidation
