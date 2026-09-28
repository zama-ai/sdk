---
title: useActiveBatcher
description: Query hook for the batcher a join through a batcher history would reach right now.
---

# useActiveBatcher

Reads which batcher of a [batcher history](../sdk/VaultGroup.md#batcherhistory) a new join would reach: the first retired batcher whose open batch has not passed its `lastBatchId`, else `latest`. Same lookup as `resolveActiveBatcher` in the core SDK.

A submission resolves this itself, so the hook is only for showing it — for example to read the open batch of the batcher a deposit is about to join.

## Import

```ts
import { useActiveBatcher } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="NextBatcher.tsx" %}

```tsx
import { useActiveBatcher, useCurrentBatchId } from "@zama-fhe/react-sdk/vaults";
import { STABLE_GROUP } from "./group";

function NextBatcher() {
  const { data: batcher } = useActiveBatcher(
    { history: STABLE_GROUP.vaults[0].batchers.deposit },
    { refetchInterval: 15_000 },
  );
  const { data: batchId } = useCurrentBatchId(
    { address: batcher ?? "0x" },
    { enabled: batcher !== undefined },
  );

  return <span>Next join lands in batch #{batchId?.toString() ?? "…"}</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseActiveBatcherConfig } from "@zama-fhe/react-sdk/vaults";
```

### history

`BatcherHistory`

One vault's batcher history for one direction.

{% include ".gitbook/includes/query-options.md" %}

The handover from a retired batcher happens when someone dispatches its last batch, not at a scheduled time, so nothing client-side predicts when this flips. Pass a `refetchInterval` on a screen that stays open.

## Return Type

The `data` property is `Address | undefined` — the batcher a join would reach now.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useActiveBatchers](./useActiveBatchers.md) — the same, for every member of a group
- [useCurrentBatchId](./useCurrentBatchId.md) — the open batch on that batcher
- [Query keys → `vaultQueryKeys`](./query-keys.md#vaultquerykeys)
