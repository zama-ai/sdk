---
title: usePosition
description: Query hook that reads a vault join's position — its phase, legs, and the actions you can send now.
---

# usePosition

Reads a join record's position: every leg's batch state, the position's `phase`, the `availableActions`, and `nextChangeAt`. Same read as [`VaultClient.readPosition`](../sdk/VaultClient.md#readposition).

The hook refetches when `nextChangeAt` passes and polls while a batch settles, so a UI needs no timer of its own. See [Building a vault UI](../../guides/vaults/building-a-ui.md) for what to show in each phase.

## Import

```ts
import { usePosition } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="PositionRow.tsx" %}

```tsx
import { useExit, usePosition } from "@zama-fhe/react-sdk/vaults";
import type { VaultRecord } from "@zama-fhe/sdk/vaults";
import { VAULTS } from "./vaults";

function PositionRow({ record }: { record: VaultRecord<typeof VAULTS> }) {
  const { data: position } = usePosition(VAULTS, record);
  const exit = useExit(VAULTS);

  if (!position) return <span>Loading…</span>;

  return (
    <div>
      <span>{position.phase}</span>
      {position.availableActions.includes("exit") && (
        <button onClick={() => exit.mutate(record)}>Exit</button>
      )}
    </div>
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

### record

`VaultRecord<typeof config> | undefined`

The join record to read, as returned by `useDeposit` or `useRedeem`, or built from your indexer. The query is disabled while `undefined`.

---

### options.decrypt

`boolean | undefined`

Default: `false`. Decrypt every leg's deposit together, as the signer, to fill each leg's `amount`, `chosenVaultId`, and the `closed` phase. The first decryption asks the wallet for a signature, so turn it on after a user click.

Without `decrypt`, an exited position still reads `ready` or `queued`, with `exit` available. See [Closed](../../guides/vaults/building-a-ui.md#closed).

```tsx
const { data: position } = usePosition(VAULTS, record, { decrypt: true });
```

{% include ".gitbook/includes/query-options.md" %}

Passing `refetchInterval` replaces the automatic refetch on `nextChangeAt`.

## Return Type

```ts
import { type VaultPosition } from "@zama-fhe/sdk/vaults";
```

The `data` property is `VaultPosition<typeof config> | undefined`, `undefined` while loading or disabled.

| Field              | Type                                            | Description                                                                                                                            |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `record`           | `JoinRecord`                                    | The join read.                                                                                                                         |
| `phase`            | `"queued" \| "settling" \| "ready" \| "closed"` | Where the join is, taken over all its legs.                                                                                            |
| `legs`             | `Leg[]`                                         | Each leg's batch state, in record order.                                                                                               |
| `availableActions` | `("exit" \| "dispatch" \| "finalize")[]`        | What you can send now. Each maps to [`useExit`](./useExit.md), [`useDispatch`](./useDispatch.md) or [`useFinalize`](./useFinalize.md). |
| `chosenVaultId`    | `string \| null`                                | The vault with a non-zero deposit, after a read with `decrypt`.                                                                        |
| `observedAt`       | `bigint`                                        | The block timestamp of the read.                                                                                                       |
| `nextChangeAt`     | `bigint \| null`                                | The next chain time at which `availableActions` can change on its own.                                                                 |

See [`Position`](../sdk/VaultClient.md#position) and [`Leg`](../sdk/VaultClient.md#leg) for the phases and leg states in full.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [Building a vault UI](../../guides/vaults/building-a-ui.md): what to show and offer in each phase
- [useExit](./useExit.md): exit the position
- [VaultClient.readPosition](../sdk/VaultClient.md#readposition)
