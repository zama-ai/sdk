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

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useUnshield } from "@zama-fhe/react-sdk";

function UnshieldButton() {
  const { mutateAsync: unshield, isPending } = useUnshield({ tokenAddress: "0xToken" });

  async function handleUnshield() {
    await unshield({
      amount: 500n,
      onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
      onFinalizing: () => console.log("Waiting for decryption proof..."),
      onFinalizeSubmitted: (txHash) => console.log("Finalized:", txHash),
    });
  }

  return (
    <button onClick={handleUnshield} disabled={isPending}>
      {isPending ? "Unshielding..." : "Unshield"}
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

```ts
import { type UnshieldParams } from "@zama-fhe/sdk/query";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: unshield } = useUnshield({
  tokenAddress: "0xToken",
});
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### amount

`bigint`

Number of confidential tokens to unshield.

```ts
await unshield({ amount: 500n });
```

### skipBalanceCheck

`boolean | undefined`

Skip confidential balance validation (e.g. for smart wallets that cannot produce EIP-712 signatures). Defaults to `false`.

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
await unshield({
  amount: 500n,
  onUnwrapSubmitted: (txHash) => updateUI("Step 1 submitted"),
  onFinalizing: () => updateUI("Awaiting proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Complete"),
});
```

**Throws:**

- `InsufficientConfidentialBalanceError` -- if the confidential balance is less than `amount` (exposes `requested`, `available`, `token`)
- `BalanceCheckUnavailableError` -- if balance validation is required but decryption is not possible (no cached credentials). Call `allow()` first or use `skipBalanceCheck: true`

## Return Type

```ts
import { type UnshieldParams } from "@zama-fhe/sdk/query";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshieldAll](/reference/react/useUnshieldAll) — unshield the entire confidential balance
- [useResumeUnshield](/reference/react/useResumeUnshield) — resume an interrupted unshield
- [useShield](/reference/react/useShield) — reverse operation, shield public tokens
- [Token.unshield](/reference/sdk/Token#unshield) — imperative equivalent on the `Token` class
