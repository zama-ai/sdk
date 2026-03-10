---
title: useShieldFee
description: Calculate the shield (wrap) fee for a given amount.
---

# useShieldFee

Calculate the shield (wrap) fee for a given amount. Query the fee manager contract to determine how much will be charged when shielding tokens.

## Import

```ts
import { useShieldFee } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ShieldForm.tsx" %}

```tsx
import { useShieldFee } from "@zama-fhe/react-sdk";

function ShieldForm({
  feeManagerAddress,
  userAddress,
  wrapperAddress,
}: {
  feeManagerAddress: `0x${string}`;
  userAddress: `0x${string}`;
  wrapperAddress: `0x${string}`;
}) {
  const amount = 1000n;

  const { data: fee, isLoading } = useShieldFee({
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
      <p>Total: {fee !== undefined ? (amount + fee).toString() : "..."}</p>
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
useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### amount

`bigint`

Token amount to calculate the fee for.

```ts
useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### from

`Address`

Address of the sender.

```ts
useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xUser",
  to: "0xWrapper",
});
```

### to

`Address`

Address of the recipient (typically the wrapper contract).

```ts
useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xUser",
  to: "0xWrapper",
});
```

## Return Type

The `data` field resolves to `bigint` -- the fee amount in token units.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useUnshieldFee](/reference/react/useUnshieldFee) -- calculate the unshield (unwrap) fee
- [useShield](/reference/react/useShield) -- shield tokens
- [Query keys](/reference/react/query-keys) -- `zamaQueryKeys.fees.shieldFee(...)` for cache control
