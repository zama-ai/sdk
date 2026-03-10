---
title: useUnshieldFee
description: Calculate the unshield (unwrap) fee for a given amount.
---

# useUnshieldFee

Calculate the unshield (unwrap) fee for a given amount. Query the fee manager contract to determine how much will be charged when unshielding tokens.

## Import

```ts
import { useUnshieldFee } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="UnshieldForm.tsx" %}

```tsx
import { useUnshieldFee } from "@zama-fhe/react-sdk";

function UnshieldForm({
  feeManagerAddress,
  userAddress,
  wrapperAddress,
}: {
  feeManagerAddress: Address;
  userAddress: Address;
  wrapperAddress: Address;
}) {
  const amount = 500n;

  const { data: fee, isLoading } = useUnshieldFee({
    feeManagerAddress,
    amount,
    from: userAddress,
    to: wrapperAddress,
  });

  if (isLoading) return <p>Calculating fee...</p>;

  return (
    <div>
      <p>Amount: {amount.toString()}</p>
      <p>Fee: {fee?.toString()}</p>
      <p>You receive: {fee !== undefined ? (amount - fee).toString() : "..."}</p>
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### feeManagerAddress

`Address`

Address of the fee manager contract.

```ts
useUnshieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 500n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### amount

`bigint`

Token amount to calculate the fee for.

```ts
useUnshieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 500n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### from

`Address`

Address of the sender.

```ts
useUnshieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 500n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### to

`Address`

Address of the recipient.

```ts
useUnshieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 500n,
  from: "0xUser",
  to: "0xWrapper",
});
```

## Return Type

The `data` field resolves to `bigint` -- the fee amount in token units.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useShieldFee](/reference/react/useShieldFee) -- calculate the shield (wrap) fee
- [useUnshield](/reference/react/useUnshield) -- unshield tokens
- [Query keys](/reference/react/query-keys) -- `zamaQueryKeys.fees.unshieldFee(...)` for cache control
- [Hooks overview](/reference/react/query-keys) -- all available hooks
