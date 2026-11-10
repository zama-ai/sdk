---
title: useOpenBatches
description: Query hook that reads the open batch of every vault in a group.
---

# useOpenBatches

Reads the open batch of every vault of a group: the batch the next join lands in, when it can be dispatched, and whether the batcher is paused. Same read as [`VaultClient.readOpenBatches`](../sdk/VaultClient.md#readopenbatches). It needs no join record, so use it on a deposit or redeem form.

## Import

```ts
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="NextBatch.tsx" %}

```tsx
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";
import { VAULTS } from "./vaults";

function NextBatch() {
  const { data: batches } = useOpenBatches(VAULTS, { groupId: "stable", direction: "deposit" });

  if (!batches) return null;

  return (
    <ul>
      {batches.map((batch) => (
        <li key={batch.vaultId}>
          {batch.vaultId}:{" "}
          {batch.paused ? "paused" : `opens for dispatch at ${batch.dispatchableAt}`}
        </li>
      ))}
    </ul>
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

### params.groupId

`string`

The group to read. Typed to the config's group ids.

---

### params.direction

`"deposit" | "redeem"`

Whether to read the deposit batchers or the redeem batchers.

{% include ".gitbook/includes/query-options.md" %}

The query does not refetch on its own. Pass `refetchInterval` to keep a countdown fresh.

## Return Type

```ts
import { type OpenBatch } from "@zama-fhe/sdk/vaults";
```

The `data` property is `OpenBatch[] | undefined`, one entry per vault of the group, in config order.

| Field            | Type      | Description                                                                       |
| ---------------- | --------- | --------------------------------------------------------------------------------- |
| `vaultId`        | `string`  | The vault.                                                                        |
| `batcher`        | `Address` | Its batcher for the direction read.                                               |
| `batchId`        | `bigint`  | The open batch.                                                                   |
| `dispatchableAt` | `bigint`  | When anyone may dispatch the batch, in chain seconds.                             |
| `paused`         | `boolean` | Whether the batcher is paused. One paused batcher blocks every join of the group. |

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md#1-the-form): what the form shows
- [useDeposit](./useDeposit.md), [useRedeem](./useRedeem.md)
- [VaultClient.readOpenBatches](../sdk/VaultClient.md#readopenbatches)
