---
title: useUnwrapAll
description: Low-level mutation hook that requests an unwrap for the full confidential balance.
---

# useUnwrapAll

Low-level mutation hook that requests an unwrap for the full confidential balance. You must finalize manually with [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap).

::: tip
Most apps should use [`useUnshieldAll`](/reference/react/query-keys#useunshieldall) instead, which orchestrates both steps in a single call.
:::

## Import

```ts
import { useUnwrapAll } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [UnwrapAllButton.tsx]
import { useUnwrapAll } from "@zama-fhe/react-sdk";

function UnwrapAllButton() {
  const { mutateAsync: unwrapAll, isPending } = useUnwrapAll({
    tokenAddress: "0xToken",
  });

  const handleUnwrapAll = async () => {
    const txHash = await unwrapAll(); // [!code focus]
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

:::

## Parameters

```ts
import { type UseUnwrapAllParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential token wrapper contract.

```tsx
const { mutateAsync: unwrapAll } = useUnwrapAll({
  tokenAddress: "0xToken", // [!code focus]
});
```

## Return Type

```ts
import { type UseUnwrapAllReturnType } from "@zama-fhe/react-sdk";
```

The mutation resolves with a transaction hash (`Hex`).

<!--@include: @/shared/mutation-result.md-->

## Related

- [`useFinalizeUnwrap`](/reference/react/useFinalizeUnwrap) -- finalize the unwrap with a decryption proof
- [`useUnwrap`](/reference/react/useUnwrap) -- unwrap a specific amount
- [`useUnshieldAll`](/reference/react/query-keys#useunshieldall) -- high-level hook that handles both steps
