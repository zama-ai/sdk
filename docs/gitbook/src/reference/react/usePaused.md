---
title: usePaused
description: Query hook for whether a vault batcher is paused.
---

# usePaused

Reads whether a batcher is paused. Same read as [`VaultBatcher.paused`](../sdk/VaultBatcher.md#paused). While a batcher is paused, joins and dispatches revert, so disable the deposit or redeem form and say why. Quit and claim still work.

## Import

```ts
import { usePaused } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DepositButton.tsx" %}

```tsx
import { usePaused } from "@zama-fhe/react-sdk/vaults";

function DepositButton({ onDeposit }: { onDeposit: () => void }) {
  const { data: paused } = usePaused({ address: "0xDepositBatcher" });

  return (
    <button disabled={paused !== false} onClick={onDeposit}>
      {paused ? "Deposits are paused" : "Deposit"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UsePausedConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### chainId

`number | undefined`

Chain to read from, when it is not the connected one. Needs a provider that can route reads, such as `WagmiProvider`. Part of the query key.

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UsePausedOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `boolean | undefined`, `undefined` while loading.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md) — what the form should do while paused
- [VaultBatcher.paused](../sdk/VaultBatcher.md#paused)
