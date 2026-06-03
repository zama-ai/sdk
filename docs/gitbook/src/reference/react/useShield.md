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

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useShield } from "@zama-fhe/react-sdk";

function ShieldButton() {
  const { mutateAsync: shield, isPending, error } = useShield({ address: "0xWrapper" });

  async function handleShield() {
    const { txHash, receipt } = await shield({ amount: 1000n });
    console.log("Shielded in", txHash);
  }

  return (
    <button onClick={handleShield} disabled={isPending}>
      {isPending ? "Shielding..." : "Shield"}
    </button>
  );
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
// config.ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// In your app layout:
// <ZamaProvider config={zamaConfig}>
//   <App />
// </ZamaProvider>
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseShieldConfig } from "@zama-fhe/react-sdk";
```

### address

`Address`

Address of the confidential wrapper contract.

```ts
const { mutateAsync: shield } = useShield({
  address: "0xWrapper",
});
```

### optimistic

`boolean | undefined`

Default: `false`. When `true`, optimistically adds the wrapped amount to the cached confidential balance before the transaction confirms; rolls back on error.

```ts
const { mutateAsync: shield } = useShield({
  address: "0xWrapper",
  optimistic: true,
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of tokens to shield (in the token's smallest unit).

```ts
await shield({ amount: 1000n });
```

### approvalStrategy

`"exact" | "max" | "skip" | undefined`

Default: `"exact"`.

Controls how the SDK handles the ERC-20 approval before shielding.

| Strategy  | Behavior                                                                        |
| --------- | ------------------------------------------------------------------------------- |
| `"exact"` | Approves only the shielded amount. Safest, but costs an approval tx every time. |
| `"max"`   | Approves `type(uint256).max`. One approval covers all future shields.           |
| `"skip"`  | Skips the approval step entirely. Use when the wrapper is already approved.     |

```ts
await shield({ amount: 1000n, approvalStrategy: "max" });
```

### onApprovalSubmitted

`((txHash: Hex) => void) | undefined`

Fires when the approval transaction is submitted.

### onShieldSubmitted

`((txHash: Hex) => void) | undefined`

Fires when the shield transaction is submitted.

```ts
await shield({
  amount: 1000n,
  onApprovalSubmitted: (txHash) => updateUI(`Approval: ${txHash}`),
  onShieldSubmitted: (txHash) => updateUI(`Shield: ${txHash}`),
});
```

**Throws:**

- `InsufficientERC20BalanceError` -- if the ERC-20 balance is less than `amount` (exposes `requested`, `available`, `token`)

## Return Type

```ts
import { type ShieldParams } from "@zama-fhe/sdk/query";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](/reference/react/useUnshield) — reverse operation, unshield back to public ERC-20
- [WrappedToken.shield](/reference/sdk/WrappedToken#shield) — imperative equivalent on the `WrappedToken` class
