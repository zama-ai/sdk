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
  const { mutateAsync: unshieldAll, isPending } = useUnshieldAll({ tokenAddress: "0xToken" });

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
import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-relayer.example.com/v2",
  network: "https://your-rpc.example.com",
} as const satisfies FheChain;

export const zamaConfig = createConfig({
  chains: [mySepolia],
  relayers: { [mySepolia.id]: web() },
  wagmiConfig,
});
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xToken",
});
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

- [useUnshield](/reference/react/useUnshield) — unshield a specific amount
- [useResumeUnshield](/reference/react/useResumeUnshield) — resume an interrupted unshield
- [useShield](/reference/react/useShield) — reverse operation, shield public tokens
- [Token.unshieldAll](/reference/sdk/Token#unshieldall) — imperative equivalent on the `Token` class
