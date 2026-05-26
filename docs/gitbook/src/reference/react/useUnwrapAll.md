---
title: useUnwrapAll
description: Low-level mutation hook that requests an unwrap for the full confidential balance.
---

# useUnwrapAll

Low-level mutation hook that requests an unwrap for the full confidential balance. You must finalize manually with [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap).

{% hint style="info" %}
Most apps should use [`useUnshieldAll`](/reference/react/useUnshieldAll) instead, which orchestrates both steps in a single call.
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
    // You must now parse the UnwrapRequested event and finalize with its unwrapRequestId.
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

- [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap) -- finalize the unwrap with a decryption proof
- [`useUnwrap`](/reference/react/useUnwrap) -- unwrap a specific amount
- [`useUnshieldAll`](/reference/react/useUnshieldAll) -- high-level hook that handles both steps
