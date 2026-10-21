---
title: useCurrentBatchId
description: Query hook for the id of a vault batcher's currently open batch.
---

# useCurrentBatchId

Reads the id of a batcher's currently open (not-yet-dispatched) batch — the batch a deposit or redeem would join right now. Same read as [`VaultBatcher.currentBatchId`](../sdk/VaultBatcher.md#currentbatchid).

Use it for a "next batch" display. To follow a batch you already joined, use the `batchId` returned by [`useDeposit`](./useDeposit.md) / [`useRedeem`](./useRedeem.md) instead; the current id moves on as soon as the batch is dispatched.

## Import

```ts
import { useCurrentBatchId } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="NextBatch.tsx" %}

```tsx
import { useCurrentBatchId, useTimeUntilDispatchable } from "@zama-fhe/react-sdk/vaults";

function NextBatch() {
  const { data: batchId } = useCurrentBatchId({ address: "0xDepositBatcher" });
  const { data: secondsLeft } = useTimeUntilDispatchable(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 5_000 },
  );

  if (batchId === undefined) return <span>Loading...</span>;
  return (
    <span>
      Batch #{batchId.toString()} — dispatchable in {secondsLeft?.toString() ?? "…"}s
    </span>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseCurrentBatchIdConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseCurrentBatchIdOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `bigint | undefined` — the open batch's id. Batch ids start at `1`.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useBatchState](./useBatchState.md) — a batch's lifecycle state
- [useTimeUntilDispatchable](./useTimeUntilDispatchable.md) — countdown to dispatch
- [Query keys → `vaultQueryKeys`](./query-keys.md#vaultquerykeys)
