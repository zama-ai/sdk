---
title: useFinalizeUnwrap
description: Low-level mutation hook that finalizes an unwrap with the decryption proof.
---

# useFinalizeUnwrap

Low-level mutation hook that finalizes an unwrap with the decryption proof. Call this after [`useUnwrap`](./useUnwrap.md) or [`useUnwrapAll`](./useUnwrapAll.md) has submitted the initial unwrap transaction.

{% hint style="info" %}
Most apps should use [`useUnshield`](./useUnshield.md) instead, which orchestrates both steps (unwrap + finalize) in a single call. Use this hook for custom multi-step flows where you need control over each phase.
{% endhint %}

## Import

```ts
import { useFinalizeUnwrap } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="TwoStepUnshield.tsx" %}

```tsx
import { useUnwrap, useFinalizeUnwrap } from "@zama-fhe/react-sdk";

function TwoStepUnshield() {
  const { mutateAsync: unwrap } = useUnwrap("0xWrapper");
  const { mutateAsync: finalize, isPending } = useFinalizeUnwrap("0xWrapper");

  const handleUnshield = async () => {
    // Step 1: submit the unwrap -- the result carries the `unwrapRequestId`.
    const result = await unwrap({ amount: 500n });

    // Step 2: finalize. Pass the whole result; the hook reads `unwrapRequestId`.
    await finalize(result);
  };

  return (
    <button onClick={handleUnshield} disabled={isPending}>
      {isPending ? "Finalizing..." : "Unshield (two-step)"}
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
const { mutateAsync: finalize } = useFinalizeUnwrap("0xWrapper");
```

## Mutation variables

### unwrapRequestId

`EncryptedValue`

The unwrap request ID. Read it from the `UnwrapResult` returned by [`useUnwrap`](./useUnwrap.md) / [`useUnwrapAll`](./useUnwrapAll.md) -- you can pass the whole result, since it's a superset of `{ unwrapRequestId }`.

```tsx
await finalize({ unwrapRequestId: requestId });
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useUnwrap`](./useUnwrap.md) -- request unwrap for a specific amount
- [`useUnwrapAll`](./useUnwrapAll.md) -- request unwrap for the full balance
- [`useResumeUnshield`](./useResumeUnshield.md) -- resume an interrupted unshield
- [`useUnshield`](./useUnshield.md) -- high-level hook that handles both steps
