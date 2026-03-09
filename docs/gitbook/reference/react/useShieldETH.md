---
title: useShieldETH
description: Mutation hook that shields native ETH into a confidential ETH wrapper contract.
---

# useShieldETH

Mutation hook that shields native ETH into a confidential ETH wrapper contract. No ERC-20 approval needed.

## Import

```ts
import { useShieldETH } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useShieldETH } from "@zama-fhe/react-sdk";

function ShieldETHButton() {
  const { mutateAsync: shieldETH, isPending, error } = useShieldETH({ tokenAddress: "0xToken" }); // [!code focus]

  async function handleShield() {
    const { txHash, receipt } = await shieldETH({ amount: 1000n }); // [!code focus]
    console.log("ETH shielded in", txHash);
  }

  return (
    <button onClick={handleShield} disabled={isPending}>
      {isPending ? "Shielding ETH..." : "Shield ETH"}
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
import { type UseShieldETHParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ETH wrapper contract.

```ts
const { mutateAsync: shieldETH } = useShieldETH({
  tokenAddress: "0xToken", // [!code focus]
});
```

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Amount of ETH to shield (in wei).

```ts
await shieldETH({ amount: 1000n }); // [!code focus]
```

## Return Type

```ts
import { type UseShieldETHReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useShield](/reference/react/useShield) — shield ERC-20 tokens (with automatic approval)
- [useUnshield](/reference/react/useUnshield) — unshield confidential tokens back to public form
- [Token.shieldETH](/reference/sdk/Token#shieldeth) — imperative equivalent on the `Token` class
