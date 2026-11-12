---
title: useOpenBatches
description: Query hook that reads the open batch of every vault in a group.
---

# useOpenBatches

Query hook that reads the batch the next join lands in, for every vault of a group: when it can be dispatched, and whether its batcher is paused. Wraps [`VaultClient.readOpenBatches`](../sdk/VaultClient.md#readopenbatches). Use it on a deposit or redeem form.

## Import

```ts
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="NextBatch.tsx" %}

```tsx
import { useOpenBatches } from "@zama-fhe/react-sdk/vaults";
import { STABLE } from "./vaults";

function NextBatch() {
  const { data: batches } = useOpenBatches(STABLE, "deposit");

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

`STABLE` is the group from [`useDeposit`](./useDeposit.md#usage).

## Parameters

### target

`VaultGroup | Vault`

The group to read, as returned by [`defineVaultGroup`](../sdk/VaultClient.md#definevaultgroup), or a vault on its own from [`defineVault`](../sdk/VaultClient.md#definevault).

---

### direction

`"deposit" | "redeem"`

Whether to read the deposit batchers or the redeem batchers.

{% include ".gitbook/includes/query-options.md" %}

The query does not refetch on its own. Pass `refetchInterval` to keep a countdown fresh.

## Return Type

```ts
import { type OpenBatch } from "@zama-fhe/sdk/vaults";
```

The `data` property is an [`OpenBatch`](../sdk/VaultClient.md#openbatch) array, one per vault in group order, or `undefined` while loading.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md#the-form): what the form shows
- [useDeposit](./useDeposit.md), [useRedeem](./useRedeem.md)
