---
title: useActiveBatchers
description: Query hook for the batcher every member of a vault group would join right now, keyed by member id.
---

# useActiveBatchers

Reads the batcher each member of a [vault group](../../guides/vault-groups.md) would join in one direction, keyed by member id. Same read as [`VaultGroup.activeBatchers`](../sdk/VaultGroup.md#activebatchers).

A submission resolves this itself, so the hook is only for showing it.

## Import

```ts
import { useActiveBatchers } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="GroupBatchers.tsx" %}

```tsx
import { useActiveBatchers } from "@zama-fhe/react-sdk/vaults";
import { STABLE_GROUP } from "./group";

function GroupBatchers() {
  const { data } = useActiveBatchers(
    { group: STABLE_GROUP, direction: "deposit" },
    { refetchInterval: 15_000 },
  );

  return (
    <ul>
      {Object.entries(data ?? {}).map(([vaultId, batcher]) => (
        <li key={vaultId}>
          {vaultId}: {batcher}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseActiveBatchersConfig } from "@zama-fhe/react-sdk/vaults";
```

### group

`VaultGroupConfig`

The group whose members to resolve. Same shape as [`useVaultGroup`](./useVaultGroup.md) takes; keep its identity stable across renders.

### direction

`"deposit" | "redeem"`

Which side of the group to read.

{% include ".gitbook/includes/query-options.md" %}

Pass a `refetchInterval` on a screen that stays open: a retired batcher hands over when its last batch is dispatched, which nothing client-side predicts.

## Return Type

The `data` property is `Readonly<Record<string, Address>> | undefined` — one batcher per member id.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useActiveBatcher](./useActiveBatcher.md) — one history at a time
- [useVaultGroup](./useVaultGroup.md) — the group instance the read goes through
- [Query keys → `vaultQueryKeys`](./query-keys.md#vaultquerykeys)
