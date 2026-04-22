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
  const { mutateAsync: unwrapAll, isPending } = useUnwrapAll({
    tokenAddress: "0xToken",
  });

  const handleUnwrapAll = async () => {
    const txHash = await unwrapAll();
    console.log("Unwrap requested:", txHash);
    // You must now call useFinalizeUnwrap with this txHash
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

### tokenAddress

`Address`

Address of the confidential token wrapper contract.

```tsx
const { mutateAsync: unwrapAll } = useUnwrapAll({
  tokenAddress: "0xToken",
});
```

## Return Type

The mutation resolves with a transaction hash (`Hex`).

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap) -- finalize the unwrap with a decryption proof
- [`useUnwrap`](/reference/react/useUnwrap) -- unwrap a specific amount
- [`useUnshieldAll`](/reference/react/useUnshieldAll) -- high-level hook that handles both steps
