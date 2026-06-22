---
title: useUnwrap
description: Low-level mutation hook that requests an unwrap for a specific amount.
---

# useUnwrap

Low-level mutation hook that requests an unwrap for a specific amount. You must finalize manually with [`useFinalizeUnwrap`](./useFinalizeUnwrap.md).

{% hint style="info" %}
Most apps should use [`useUnshield`](./useUnshield.md) instead, which orchestrates both steps (unwrap + finalize) in a single call.
{% endhint %}

## Import

```ts
import { useUnwrap } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="UnwrapButton.tsx" %}

```tsx
import { useUnwrap } from "@zama-fhe/react-sdk";

function UnwrapButton() {
  const { mutateAsync: unwrap, isPending } = useUnwrap("0xWrapper");

  const handleUnwrap = async () => {
    const { txHash } = await unwrap({ amount: 500n });
    console.log("Unwrap requested:", txHash);
    // Parse the UnwrapRequested event with findUnwrapRequested,
    // then pass unwrapRequestId to useFinalizeUnwrap.
  };

  return (
    <button onClick={handleUnwrap} disabled={isPending}>
      {isPending ? "Unwrapping..." : "Unwrap 500"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### address

`Address`

Address of the confidential wrapper contract. Passed positionally as the first argument.

```tsx
const { mutateAsync: unwrap } = useUnwrap("0xWrapper");
```

## Mutation variables

### amount

`bigint`

The amount of tokens to unwrap.

```tsx
await unwrap({ amount: 1000n });
```

## Return Type

The mutation resolves with `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useFinalizeUnwrap`](./useFinalizeUnwrap.md) -- finalize the unwrap with a decryption proof
- [`useUnwrapAll`](./useUnwrapAll.md) -- unwrap the full balance
- [`useUnshield`](./useUnshield.md) -- high-level hook that handles both steps
