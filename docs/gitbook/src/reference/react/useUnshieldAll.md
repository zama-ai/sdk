---
title: useUnshieldAll
description: Mutation hook that unshields the entire confidential balance.
---

# useUnshieldAll

Mutation hook that unshields the entire confidential balance. Orchestrates the full two-step flow (unwrap + finalize) in one call.

## Import

```ts
import { useUnshieldAll } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useUnshieldAll } from "@zama-fhe/react-sdk";

function UnshieldAllButton() {
  const { mutateAsync: unshieldAll, isPending } = useUnshieldAll("0xWrapper");

  async function handleUnshieldAll() {
    await unshieldAll({
      onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
      onFinalizing: () => console.log("Waiting for proof..."),
      onFinalizeSubmitted: (txHash) => console.log("Done:", txHash),
    });
  }

  return (
    <button onClick={handleUnshieldAll} disabled={isPending}>
      {isPending ? "Unshielding..." : "Unshield All"}
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
const { mutateAsync: unshieldAll } = useUnshieldAll("0xWrapper");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time. All variables are optional.

### onUnwrapSubmitted

`((txHash: Hex) => void) | undefined`

Fires when the unwrap transaction is submitted on-chain.

### onFinalizing

`(() => void) | undefined`

Fires when the SDK begins waiting for the decryption proof.

### onFinalizeSubmitted

`((txHash: Hex) => void) | undefined`

Fires when the finalize transaction is submitted on-chain.

{% hint style="info" %}
Callbacks are safe — if one throws, the unshield still completes.
{% endhint %}

```ts
await unshieldAll({
  onUnwrapSubmitted: (txHash) => updateUI("Step 1 submitted"),
  onFinalizing: () => updateUI("Awaiting proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Complete"),
});
```

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](./useUnshield.md) — unshield a specific amount
- [useResumeUnshield](./useResumeUnshield.md) — resume an interrupted unshield
- [useShield](./useShield.md) — reverse operation, shield public tokens
- [WrappedToken.unshieldAll](../sdk/WrappedToken.md#unshieldall) — imperative equivalent on the `WrappedToken` class
