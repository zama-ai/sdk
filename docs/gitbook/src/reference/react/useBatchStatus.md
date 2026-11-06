---
title: useBatchStatus
description: Query hook for a vault batch's state together with its timestamps.
---

# useBatchStatus

Reads a batch's state together with the timestamps that state needs. Same read as [`VaultBatcher.batchStatus`](../sdk/VaultBatcher.md#batchstatus).

- Every state carries `createdAt` and `dispatchableAt`.
- `Pending` adds `secondsUntilDispatchable`.
- `Dispatched` adds `dispatchedAt`, `callbackDeadlineAt` and `secondsUntilCallbackDeadline`.
- `Finalized` and `Canceled` add `dispatchedAt`.

Timestamps are Unix seconds on chain. The `secondsUntil*` values are correct at read time; to show a live countdown between refetches, tick from the `*At` timestamps.

Switch on `data.state` to render each step after a deposit or redemption. See [Building a vault UI](../../guides/vaults/building-a-ui.md) for what to show in each state.

## Import

```ts
import { useBatchStatus } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="BatchRow.tsx" %}

```tsx
import { useBatchStatus } from "@zama-fhe/react-sdk/vaults";
import { BatchState } from "@zama-fhe/sdk/vaults";

function BatchRow({ batchId }: { batchId: bigint }) {
  const { data: status } = useBatchStatus(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 10_000 },
  );

  if (!status) return <span>Loading…</span>;

  switch (status.state) {
    case BatchState.Pending:
      return (
        <span>Queued, sent in {status.secondsUntilDispatchable.toString()}s at the earliest</span>
      );
    case BatchState.Dispatched:
      return <span>Processing</span>;
    case BatchState.Finalized:
      return <span>Ready to claim</span>;
    case BatchState.Canceled:
      return <span>Did not go through</span>;
    default:
      return status satisfies never;
  }
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseBatchStatusConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### batchId

`bigint | undefined`

The batch to read. The query is disabled while `undefined`.

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseBatchStatusOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `BatchStatus | undefined`, `undefined` while loading or disabled. Seconds are measured against the chain's block timestamp at read time and stop at `0n`.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md) — what to show and offer in each state
- [useBatchState](./useBatchState.md) — the state alone
- [useTimeUntilDispatchable](./useTimeUntilDispatchable.md) and [useTimeUntilCallbackDeadline](./useTimeUntilCallbackDeadline.md) — each countdown alone
- [VaultBatcher.batchStatus](../sdk/VaultBatcher.md#batchstatus)
