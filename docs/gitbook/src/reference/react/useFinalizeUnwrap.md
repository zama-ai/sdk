---
title: useFinalizeUnwrap
description: Low-level mutation hook that finalizes an unwrap with the decryption proof.
---

# useFinalizeUnwrap

Low-level mutation hook that finalizes an unwrap with the decryption proof. Call this after [`useUnwrap`](/reference/react/useUnwrap) or [`useUnwrapAll`](/reference/react/useUnwrapAll) has submitted the initial unwrap transaction.

{% hint style="info" %}
Most apps should use [`useUnshield`](/reference/react/useUnshield) instead, which orchestrates both steps (unwrap + finalize) in a single call. Use this hook for custom multi-step flows where you need control over each phase.
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
import { findUnwrapRequested } from "@zama-fhe/sdk";

function TwoStepUnshield() {
  const { mutateAsync: unwrap } = useUnwrap({ tokenAddress: "0xToken" });
  const { mutateAsync: finalize, isPending } = useFinalizeUnwrap({
    tokenAddress: "0xToken",
  });

  const handleUnshield = async () => {
    // Step 1: submit the unwrap and find the event in the receipt
    const { receipt } = await unwrap({ amount: 500n });
    const event = findUnwrapRequested(receipt.logs);

    // Step 2: finalize with the unwrap request ID (upgraded) or burn amount handle (legacy)
    await finalize(
      event.unwrapRequestId
        ? { unwrapRequestId: event.unwrapRequestId }
        : { burnAmountHandle: event.encryptedAmount },
    );
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

### tokenAddress

`Address`

Address of the confidential token wrapper contract.

```tsx
const { mutateAsync: finalize } = useFinalizeUnwrap({
  tokenAddress: "0xToken",
});
```

## Mutation variables

The finalize function accepts a discriminated union — pass one of these:

### unwrapRequestId

`Handle`

The unwrap request ID emitted by upgraded contract events. This is the preferred form.

```tsx
await finalize({ unwrapRequestId: requestId });
```

### burnAmountHandle

`Handle`

The burn amount handle from pre-upgrade contract events. Use this for legacy events only.

```tsx
await finalize({ burnAmountHandle: handle });
```

## Return Type

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`useUnwrap`](/reference/react/useUnwrap) -- request unwrap for a specific amount
- [`useUnwrapAll`](/reference/react/useUnwrapAll) -- request unwrap for the full balance
- [`useResumeUnshield`](/reference/react/useResumeUnshield) -- resume an interrupted unshield
- [`useUnshield`](/reference/react/useUnshield) -- high-level hook that handles both steps
