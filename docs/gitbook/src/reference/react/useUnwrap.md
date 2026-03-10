---
title: useUnwrap
description: Low-level mutation hook that requests an unwrap for a specific amount.
---

# useUnwrap

Low-level mutation hook that requests an unwrap for a specific amount. You must finalize manually with [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap).

{% hint style="info" %}
Most apps should use [`useUnshield`](/reference/react/useUnshield) instead, which orchestrates both steps (unwrap + finalize) in a single call.
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
  const { mutateAsync: unwrap, isPending } = useUnwrap({
    tokenAddress: "0xToken",
  });

  const handleUnwrap = async () => {
    const txHash = await unwrap({ amount: 500n });
    console.log("Unwrap requested:", txHash);
    // You must now call useFinalizeUnwrap with this txHash
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

```ts
import { type UseUnwrapParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token wrapper contract.

```tsx
const { mutateAsync: unwrap } = useUnwrap({
  tokenAddress: "0xToken",
});
```

## Mutation Variables

### amount

`bigint`

The amount of tokens to unwrap.

```tsx
await unwrap({ amount: 1000n });
```

## Return Type

```ts
import { type UseUnwrapReturnType } from "@zama-fhe/react-sdk";
```

The mutation resolves with a transaction hash (`Hex`).

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap) -- finalize the unwrap with a decryption proof
- [`useUnwrapAll`](/reference/react/useUnwrapAll) -- unwrap the full balance
- [`useUnshield`](/reference/react/useUnshield) -- high-level hook that handles both steps
