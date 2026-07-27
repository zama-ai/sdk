---
title: useApproveUnderlying
description: Low-level escape hatch that approves the wrapper contract to spend the underlying ERC-20.
---

# useApproveUnderlying

Approve the confidential wrapper contract to spend the underlying ERC-20. Defaults to a max `uint256` approval, and resets an existing non-zero allowance to zero first when required (as tokens like USDT demand).

{% hint style="warning" %}
This is a low-level escape hatch for pre-approving outside a shield call. Product code should prefer [`useShield`](./useShield.md), which validates the ERC-20 balance, manages approvals, and submits the shield in a single call. Don't combine `useApproveUnderlying` with [`useWrap`](./useWrap.md) to recreate `useShield` by hand.
{% endhint %}

## Import

```ts
import { useApproveUnderlying } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useApproveUnderlying } from "@zama-fhe/react-sdk";

function ApproveButton() {
  const { mutateAsync: approve, isPending, error } = useApproveUnderlying("0xWrapper");

  async function handleApprove() {
    // Omit `amount` for a max approval, or pass an exact amount.
    const { txHash } = await approve({ amount: 1000n });
    console.log("Approved in", txHash);
  }

  return (
    <button onClick={handleApprove} disabled={isPending}>
      {isPending ? "Approving..." : "Approve"}
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

### address

`Address`

Address of the confidential wrapper contract. Passed positionally as the first argument.

```ts
const { mutateAsync: approve } = useApproveUnderlying("0xWrapper");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type ApproveUnderlyingParams } from "@zama-fhe/sdk/query";
```

The function passed to `mutate` / `mutateAsync` accepts:

### amount

`bigint | undefined`

Amount of the underlying ERC-20 to approve, in its base units. Omit for a max (`type(uint256).max`) approval.

```ts
await approve({}); // max approval
await approve({ amount: 1000n }); // exact amount
```

**Throws:**

- `SigningRejectedError` -- if the user rejects the wallet prompt
- `TransactionRevertedError` -- if the approval transaction reverts

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

Auto-invalidates the `underlyingAllowance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useShield](./useShield.md) -- recommended path; handles approval and wrapping in one call
- [useWrap](./useWrap.md) -- wrap already-approved underlying into confidential tokens
- [useUnderlyingAllowance](./useUnderlyingAllowance.md) -- read the current allowance (auto-invalidated on success)
