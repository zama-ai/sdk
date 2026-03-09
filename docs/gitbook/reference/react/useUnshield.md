---
title: useUnshield
description: Mutation hook that unshields confidential tokens back to public ERC-20.
---

# useUnshield

Mutation hook that unshields confidential tokens back to public ERC-20. Orchestrates the full two-step flow (unwrap + finalize) in one call.

## Import

```ts
import { useUnshield } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useUnshield } from "@zama-fhe/react-sdk";

function UnshieldButton() {
  const { mutateAsync: unshield, isPending } = useUnshield({ tokenAddress: "0xToken" }); // [!code focus]

  async function handleUnshield() {
    await unshield({
      amount: 500n, // [!code focus]
      callbacks: {
        // [!code focus]
        onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash), // [!code focus]
        onFinalizing: () => console.log("Waiting for decryption proof..."), // [!code focus]
        onFinalizeSubmitted: (txHash) => console.log("Finalized:", txHash), // [!code focus]
      }, // [!code focus]
    });
  }

  return (
    <button onClick={handleUnshield} disabled={isPending}>
      {isPending ? "Unshielding..." : "Unshield"}
    </button>
  );
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseUnshieldParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: unshield } = useUnshield({
  tokenAddress: "0xToken", // [!code focus]
});
```

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of confidential tokens to unshield.

```ts
await unshield({ amount: 500n }); // [!code focus]
```

### callbacks

`object` (optional)

Progress callbacks for each phase. Callbacks are safe — if one throws, the unshield still completes.

| Callback                           | Fires when                                   |
| ---------------------------------- | -------------------------------------------- |
| `onUnwrapSubmitted(txHash: Hex)`   | Unwrap transaction is submitted on-chain.    |
| `onFinalizing()`                   | SDK begins waiting for the decryption proof. |
| `onFinalizeSubmitted(txHash: Hex)` | Finalize transaction is submitted on-chain.  |

```ts
await unshield({
  amount: 500n,
  callbacks: {
    onUnwrapSubmitted: (txHash) => updateUI("Step 1 submitted"), // [!code focus]
    onFinalizing: () => updateUI("Awaiting proof..."), // [!code focus]
    onFinalizeSubmitted: (txHash) => updateUI("Complete"), // [!code focus]
  },
});
```

## Return Type

```ts
import { type UseUnshieldReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useUnshieldAll](/reference/react/useUnshieldAll) — unshield the entire confidential balance
- [useResumeUnshield](/reference/react/useResumeUnshield) — resume an interrupted unshield
- [useShield](/reference/react/useShield) — reverse operation, shield public tokens
- [Token.unshield](/reference/sdk/Token#unshield) — imperative equivalent on the `Token` class
