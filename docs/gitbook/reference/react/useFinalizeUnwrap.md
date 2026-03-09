---
title: useFinalizeUnwrap
description: Low-level mutation hook that finalizes an unwrap with the decryption proof.
---

# useFinalizeUnwrap

Low-level mutation hook that finalizes an unwrap with the decryption proof. Call this after [`useUnwrap`](/reference/react/useUnwrap) or [`useUnwrapAll`](/reference/react/useUnwrapAll) has submitted the initial unwrap transaction.

::: tip
Most apps should use [`useUnshield`](/reference/react/query-keys#useunshield) instead, which orchestrates both steps (unwrap + finalize) in a single call. Use this hook for custom multi-step flows where you need control over each phase.
:::

## Import

```ts
import { useFinalizeUnwrap } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [TwoStepUnshield.tsx]
import { useUnwrap, useFinalizeUnwrap } from "@zama-fhe/react-sdk";

function TwoStepUnshield() {
  const { mutateAsync: unwrap } = useUnwrap({ tokenAddress: "0xToken" });
  const { mutateAsync: finalize, isPending } = useFinalizeUnwrap({
    tokenAddress: "0xToken",
  });

  const handleUnshield = async () => {
    // Step 1: submit the unwrap
    const unwrapTxHash = await unwrap({ amount: 500n });

    // Step 2: finalize with the decryption proof
    await finalize({ unwrapTxHash }); // [!code focus]
  };

  return (
    <button onClick={handleUnshield} disabled={isPending}>
      {isPending ? "Finalizing..." : "Unshield (two-step)"}
    </button>
  );
}
```

:::

## Parameters

```ts
import { type UseFinalizeUnwrapParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token wrapper contract.

```tsx
const { mutateAsync: finalize } = useFinalizeUnwrap({
  tokenAddress: "0xToken", // [!code focus]
});
```

## Mutation Variables

### unwrapTxHash

`Hex`

The transaction hash returned by [`useUnwrap`](/reference/react/useUnwrap) or [`useUnwrapAll`](/reference/react/useUnwrapAll). The SDK uses this to locate and verify the decryption proof on-chain.

```tsx
await finalize({ unwrapTxHash: "0xabc..." }); // [!code focus]
```

## Return Type

```ts
import { type UseFinalizeUnwrapReturnType } from "@zama-fhe/react-sdk";
```

<!--@include: @/shared/mutation-result.md-->

## Related

- [`useUnwrap`](/reference/react/useUnwrap) -- request unwrap for a specific amount
- [`useUnwrapAll`](/reference/react/useUnwrapAll) -- request unwrap for the full balance
- [`useResumeUnshield`](/reference/react/query-keys#useresumeunshield) -- resume an interrupted unshield
- [`useUnshield`](/reference/react/query-keys#useunshield) -- high-level hook that handles both steps
