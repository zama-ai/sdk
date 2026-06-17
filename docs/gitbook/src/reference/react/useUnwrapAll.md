---
title: useUnwrapAll
description: Low-level mutation hook that requests an unwrap for the full confidential balance.
---

# useUnwrapAll

Low-level mutation hook that requests an unwrap for the full confidential balance. You must finalize manually with [`useFinalizeUnwrap`](./useFinalizeUnwrap.md).

{% hint style="info" %}
Most apps should use [`useUnshieldAll`](./useUnshieldAll.md) instead, which orchestrates both steps in a single call.
{% endhint %}

## Import

```ts
import { useUnwrapAll } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="UnwrapAllButton.tsx" %}

```tsx
import { useUnwrapAll } from "@zama-fhe/react-sdk";

function UnwrapAllButton() {
  const { mutateAsync: unwrapAll, isPending } = useUnwrapAll("0xWrapper");

  const handleUnwrapAll = async () => {
    const { txHash } = await unwrapAll();
    console.log("Unwrap requested:", txHash);
    // Parse the UnwrapRequested event with findUnwrapRequested,
    // then pass unwrapRequestId to useFinalizeUnwrap.
  };

  return (
    <button onClick={handleUnwrapAll} disabled={isPending}>
      {isPending ? "Unwrapping..." : "Unwrap All"}
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
const { mutateAsync: unwrapAll } = useUnwrapAll("0xWrapper");
```

## Return Type

The mutation resolves with `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useFinalizeUnwrap`](./useFinalizeUnwrap.md) -- finalize the unwrap with a decryption proof
- [`useUnwrap`](./useUnwrap.md) -- unwrap a specific amount
- [`useUnshieldAll`](./useUnshieldAll.md) -- high-level hook that handles both steps
