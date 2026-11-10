---
title: useDispatch
description: Mutation hook that dispatches every eligible batch of a vault join.
---

# useDispatch

Mutation hook that dispatches the batch of every leg that is pending, old enough, and on an unpaused batcher. Same flow as [`VaultClient.dispatch`](../sdk/VaultClient.md#dispatch).

Dispatch is permissionless, and a keeper (an off-chain service that watches batches) normally sends it. Most apps never need this hook. Use it as a fallback when a position stays `queued` with `dispatch` in `availableActions` longer than your app expects.

## Import

```ts
import { useDispatch } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DispatchButton.tsx" %}

```tsx
import { useDispatch, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

function DispatchButton({ record }: { record: VaultRecord<typeof VAULTS> }) {
  const { data: position } = usePosition(VAULTS, record);
  const dispatch = useDispatch(VAULTS);

  if (!position?.availableActions.includes("dispatch")) return null;

  return <button onClick={() => dispatch.mutate(record)}>Send the batch now</button>;
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

The join record, passed directly to `mutate` / `mutateAsync`. The hook sends one transaction per eligible leg, so it can take up to one wallet prompt per vault of the group. Any account may send it.

**Throws:**

- `VaultActionNotAllowedError` (reason `"nothing-to-dispatch"`): no leg can be dispatched now, for example because a keeper already did it.
- `ChainMismatchError`: the wallet is not on the config's chain.

## Return Type

The `data` property (after a successful mutation) is `{ txHashes: Hex[] }`: every transaction sent, in order.

On success, the hook invalidates every vault read of the group and every confidential balance.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useFinalize](./useFinalize.md): the next step after dispatch
- [usePosition](./usePosition.md): when `dispatch` is available
- [VaultClient.dispatch](../sdk/VaultClient.md#dispatch)
