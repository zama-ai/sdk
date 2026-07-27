---
title: useWrap
description: Low-level escape hatch that wraps already-approved underlying ERC-20 into confidential tokens.
---

# useWrap

Wrap already-approved underlying ERC-20 into confidential tokens.

{% hint style="warning" %}
This is a low-level escape hatch for splitting shield across two signatures: call [`useApproveUnderlying`](./useApproveUnderlying.md) first, then this. Product code should prefer [`useShield`](./useShield.md), which routes and orchestrates the approval in one call. Don't combine `useApproveUnderlying` + `useWrap` to recreate `useShield` by hand.
{% endhint %}

## Import

```ts
import { useWrap } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useApproveUnderlying, useWrap } from "@zama-fhe/react-sdk";

function WrapButton() {
  const { mutateAsync: approve } = useApproveUnderlying("0xWrapper");
  const { mutateAsync: wrap, isPending } = useWrap("0xWrapper");

  async function handleWrap() {
    await approve({ amount: 1000n });
    const { txHash } = await wrap({ amount: 1000n });
    console.log("Wrapped in", txHash);
  }

  return (
    <button onClick={handleWrap} disabled={isPending}>
      {isPending ? "Wrapping..." : "Wrap"}
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
const { mutateAsync: wrap } = useWrap("0xWrapper");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type WrapParams } from "@zama-fhe/sdk/query";
```

The function passed to `mutate` / `mutateAsync` accepts:

### amount

`bigint`

Amount of the public ERC-20 to wrap, in the token's base units.

### to

`Address | undefined`

Recipient of the confidential tokens. Defaults to the signer address.

### onWrapSubmitted

`((txHash: Hex) => void) | undefined`

Fires with the wrap transaction hash once submitted.

```ts
await wrap({
  amount: 1000n,
  onWrapSubmitted: (txHash) => updateUI(`Wrap: ${txHash}`),
});
```

**Throws:**

- `SigningRejectedError` -- if the user rejects the wallet prompt
- `InsufficientERC20BalanceError` -- if the ERC-20 balance is less than the amount
- `InsufficientAllowanceError` -- if the allowance is less than the amount (approve first)
- `TransactionRevertedError` -- if the wrap transaction reverts

## Return Type

The `data` property (after a successful mutation) is `{ txHash: Hex, receipt: TransactionReceipt }`.

- **`txHash`** -- Transaction hash submitted to the network.
- **`receipt`** -- Confirmed transaction receipt from the chain.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useShield](./useShield.md) -- recommended path; handles approval and wrapping in one call
- [useApproveUnderlying](./useApproveUnderlying.md) -- approve the wrapper before wrapping
- [useConfidentialBalance](./useConfidentialBalance.md) -- auto-invalidated on success
