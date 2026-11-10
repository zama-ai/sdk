---
title: useFinalize
description: Mutation hook that settles every dispatched batch of a vault join.
---

# useFinalize

Mutation hook that settles the batch of every dispatched leg with its publicly decrypted amount. Same flow as [`VaultClient.finalize`](../sdk/VaultClient.md#finalize).

Finalizing is permissionless, and a keeper (an off-chain service that watches batches) normally sends it. Use this hook as a fallback when a position stays `settling` longer than your app expects. Pick the delay yourself; the SDK does not decide when a keeper is late.

Past a batch's callback deadline (the dispatched leg's `cancelsAt`), the same call **cancels** the batch instead of settling it. The user then gets the amount back on exit. Label the button accordingly. A redeem batcher whose vault settles redemptions asynchronously is the exception: once it has placed its redemption request, it keeps settling past the deadline.

## Import

```ts
import { useFinalize } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="SettleButton.tsx" %}

```tsx
import { useFinalize, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

function SettleButton({ record }: { record: VaultRecord<typeof VAULTS> }) {
  const { data: position } = usePosition(VAULTS, record);
  const finalize = useFinalize(VAULTS);

  if (position?.phase !== "settling") return null;

  const pastDeadline = position.legs.some(
    (leg) => leg.state === "dispatched" && leg.cancelsAt <= position.observedAt,
  );

  return (
    <button disabled={finalize.isPending} onClick={() => finalize.mutate(record)}>
      {pastDeadline ? "Cancel and get it back" : "Settle"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### config

`VaultsConfig`

The config returned by [`defineVaults`](../sdk/VaultClient.md#definevaults).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

The join record, passed directly to `mutate` / `mutateAsync`. The hook sends one transaction per dispatched leg. Any account may send it.

**Throws:**

- `VaultActionNotAllowedError` (reason `"nothing-to-finalize"`): no leg is dispatched, for example because a keeper already finalized it.
- `ConfigurationError`: the provider is not on the config's chain. Finalizing decrypts on the provider's chain.
- `ChainMismatchError`: the wallet is not on the config's chain.

## Return Type

The `data` property (after a successful mutation) is `{ txHashes: Hex[] }`: every transaction sent, in order.

On success, the hook invalidates every vault read of the group and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md#settling): when to offer it
- [useExit](./useExit.md): exit once the batch settles or is canceled
- [VaultClient.finalize](../sdk/VaultClient.md#finalize)
