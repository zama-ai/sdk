---
title: useBatchState
description: Query hook for a vault batch's lifecycle state, which decides what the user can do next.
---

# useBatchState

Reads a batch's lifecycle state — `Pending`, `Dispatched`, `Finalized` or `Canceled`. Same read as [`VaultBatcher.batchState`](../sdk/VaultBatcher.md#batchstate).

The state decides which action is legal, so read it before offering the user a button:

| `BatchState` | What the user can do                                  |
| ------------ | ----------------------------------------------------- |
| `Pending`    | join (`useDeposit` / `useRedeem`), or `useQuit`       |
| `Dispatched` | Nothing — wait                                        |
| `Finalized`  | `useClaim`                                            |
| `Canceled`   | `useQuit` (or `useRecover`), to take the deposit back |

Claiming a canceled batch reverts: a canceled batch never executed, so there is nothing to claim, only a deposit to take back.

## Import

```ts
import { useBatchState } from "@zama-fhe/react-sdk/vaults";
import { BatchState } from "@zama-fhe/sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="BatchActions.tsx" %}

```tsx
import { BatchState } from "@zama-fhe/sdk/vaults";
import { useBatchState, useClaim, useQuit } from "@zama-fhe/react-sdk/vaults";

function BatchActions({ batchId }: { batchId: bigint }) {
  const { data: state } = useBatchState(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 15_000 },
  );
  const claim = useClaim({ address: "0xDepositBatcher" });
  const quit = useQuit({ address: "0xDepositBatcher" });

  switch (state) {
    case BatchState.Pending:
      return <button onClick={() => quit.mutate({ batchId })}>Withdraw</button>;
    case BatchState.Dispatched:
      return <span>Settling…</span>;
    case BatchState.Finalized:
      return <button onClick={() => claim.mutate({ batchId })}>Claim</button>;
    case BatchState.Canceled:
      return <button onClick={() => quit.mutate({ batchId })}>Take deposit back</button>;
    default:
      return <span>Loading…</span>;
  }
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseBatchStateConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### batchId

`bigint | undefined`

The batch to read. The query is disabled while `undefined`, so you can pass `deposit.data?.batchId` straight from a pending mutation.

```tsx
const { data: state } = useBatchState({
  address: "0xDepositBatcher",
  batchId: deposit.data?.batchId,
});
```

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseBatchStateOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `BatchState | undefined`. Compare it against the `BatchState` constants, not raw numbers.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useClaim](./useClaim.md), [useQuit](./useQuit.md), [useRecover](./useRecover.md) — the actions each state allows
- [useTimeUntilDispatchable](./useTimeUntilDispatchable.md) — countdown while `Pending`
- [VaultBatcher → BatchState](../sdk/VaultBatcher.md#batchstate)
