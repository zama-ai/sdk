---
title: useBatch
description: Query hook that reads one vault batch — its state, timings, and the actions you can send now.
---

# useBatch

Reads one batch: its `state`, its timings, the account's encrypted deposit, and the `actions` you can send now. Same read as [`VaultClient.readBatch`](../sdk/VaultClient.md#readbatch).

The hook refetches when `nextChangeAt` passes and polls while the batch waits for a dispatch or a settlement, so a UI needs no timer of its own. See [Building a vault UI](../../guides/vaults/building-a-ui.md) for what to show in each state.

## Import

```ts
import { useBatch } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="BatchRow.tsx" %}

```tsx
import { useBatch, useClaim, useQuit } from "@zama-fhe/react-sdk/vaults";
import type { BatchRef } from "@zama-fhe/sdk/vaults";
import type { Address } from "viem";

function BatchRow({ batchRef, account }: { batchRef: BatchRef; account: Address }) {
  const { data: batch } = useBatch(batchRef, { account });
  const claim = useClaim();
  const quit = useQuit();

  if (!batch) return <span>Loading…</span>;

  return (
    <div>
      <span>{batch.state}</span>
      {batch.actions.includes("claim") && (
        <button onClick={() => claim.mutate({ ...batchRef, account })}>Claim</button>
      )}
      {batch.actions.includes("quit") && (
        <button onClick={() => quit.mutate(batchRef)}>Cancel</button>
      )}
    </div>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### batch

`BatchRef | undefined`

The batch to read: `{ chainId, batcher, batchId }`, as returned in the `batches` of [`useDeposit`](./useDeposit.md) or [`useRedeem`](./useRedeem.md). The query is disabled while `undefined`.

---

### options.account

`Address | undefined`

Read this account's encrypted deposit, and list `claim` and `quit` for it. Without it, `actions` only lists `dispatch` and `finalize`.

```tsx
const { data: batch } = useBatch(batchRef, { account: "0xUser" });
```

{% include ".gitbook/includes/query-options.md" %}

Passing `refetchInterval` replaces the automatic refetch on `nextChangeAt`.

## Return Type

```ts
import { type Batch } from "@zama-fhe/sdk/vaults";
```

The `data` property is `Batch | undefined`, `undefined` while loading or disabled. `Batch` is a union keyed on `state`, so check `state` before you read `cancelsAt` or `exchangeRate`.

| Field            | Type                                                     | Description                                                                                                                                                         |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`          | `"pending" \| "dispatched" \| "finalized" \| "canceled"` | The batch's state.                                                                                                                                                  |
| `dispatchableAt` | `bigint`                                                 | When anyone may dispatch it.                                                                                                                                        |
| `cancelsAt`      | `bigint`                                                 | Every state but `pending`. From this time, finalizing cancels the batch instead of settling it.                                                                     |
| `exchangeRate`   | `{ rate: bigint; decimals: number }`                     | `finalized` only. The batch's exchange rate.                                                                                                                        |
| `paused`         | `boolean`                                                | Whether the batcher is paused.                                                                                                                                      |
| `deposit`        | `EncryptedValue \| null`                                 | The account's encrypted deposit, when you passed `account`.                                                                                                         |
| `actions`        | `("claim" \| "quit" \| "dispatch" \| "finalize")[]`      | What you can send now. Each maps to [`useClaim`](./useClaim.md), [`useQuit`](./useQuit.md), [`useDispatch`](./useDispatch.md) or [`useFinalize`](./useFinalize.md). |
| `observedAt`     | `bigint`                                                 | The block timestamp of the read.                                                                                                                                    |
| `nextChangeAt`   | `bigint \| null`                                         | The next chain time at which `actions` can change on its own.                                                                                                       |

See [`Batch`](../sdk/VaultClient.md#batch) for every field and when each action is listed.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md): what to show and offer in each state
- [useClaim](./useClaim.md), [useQuit](./useQuit.md): get the money out
- [VaultClient.readBatch](../sdk/VaultClient.md#readbatch)
