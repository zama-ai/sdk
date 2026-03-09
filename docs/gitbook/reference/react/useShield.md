---
title: useShield
description: Mutation hook that shields public ERC-20 tokens into confidential form.
---

# useShield

Mutation hook that shields public ERC-20 tokens into confidential form, handling the ERC-20 approval automatically.

## Import

```ts
import { useShield } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useShield } from "@zama-fhe/react-sdk";

function ShieldButton() {
  const { mutateAsync: shield, isPending, error } = useShield({ tokenAddress: "0xToken" }); // [!code focus]

  async function handleShield() {
    const { txHash, receipt } = await shield({ amount: 1000n }); // [!code focus]
    console.log("Shielded in", txHash);
  }

  return (
    <button onClick={handleShield} disabled={isPending}>
      {isPending ? "Shielding..." : "Shield"}
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
import { type UseShieldParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: shield } = useShield({
  tokenAddress: "0xToken", // [!code focus]
});
```

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of tokens to shield (in the token's smallest unit).

```ts
await shield({ amount: 1000n }); // [!code focus]
```

### approvalStrategy

`"exact" | "max" | "skip"` (optional, default `"exact"`)

Controls how the SDK handles the ERC-20 approval before shielding.

| Strategy  | Behavior                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| `"exact"` | Approves only the shielded amount. Safest, but costs an approval tx every time. |
| `"max"`   | Approves `type(uint256).max`. One approval covers all future shields.           |
| `"skip"`  | Skips the approval step entirely. Use when the wrapper is already approved.     |

```ts
await shield({ amount: 1000n, approvalStrategy: "max" }); // [!code focus]
```

## Return Type

```ts
import { type UseShieldReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useShieldETH](/reference/react/useShieldETH) — shield native ETH instead of ERC-20 tokens
- [useUnshield](/reference/react/useUnshield) — reverse operation, unshield back to public ERC-20
- [Token.shield](/reference/sdk/Token#shield) — imperative equivalent on the `Token` class
