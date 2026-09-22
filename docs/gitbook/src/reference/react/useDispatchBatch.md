---
title: useDispatchBatch
description: Mutation hook that dispatches a vault batcher's current batch once it is old enough.
---

# useDispatchBatch

Mutation hook that closes a batcher's current batch and kicks off decryption of its aggregate amount. Same call as [`VaultBatcher.dispatchBatch`](../sdk/VaultBatcher.md#dispatchbatch).

Dispatching is permissionless — any connected account can do it, not just participants — but it reverts until the batch has reached its pinned minimum age (when [`useTimeUntilDispatchable`](./useTimeUntilDispatchable.md) reads `0`) and while the batcher is paused. Dispatch only starts decryption; the batch becomes claimable later, once the relayer finalizes it.

## Import

```ts
import { useDispatchBatch } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="DispatchButton.tsx" %}

```tsx
import { useDispatchBatch, useTimeUntilDispatchable } from "@zama-fhe/react-sdk/vaults";

function DispatchButton({ batchId }: { batchId: bigint }) {
  const { data: secondsLeft } = useTimeUntilDispatchable(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 5_000 },
  );
  const { mutate: dispatchBatch, isPending } = useDispatchBatch({ address: "0xDepositBatcher" });

  return (
    <button onClick={() => dispatchBatch()} disabled={isPending || secondsLeft !== 0n}>
      {isPending ? "Dispatching..." : "Dispatch batch"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseDispatchBatchConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

None. Call `mutate()` / `mutateAsync()` with no arguments — the batcher always dispatches its current batch.

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }`.

On success the hook invalidates the batcher's batch reads: a new batch opens and the old one leaves `Pending`, so `useCurrentBatchId`, `useBatchState` and `useTimeUntilDispatchable` refetch.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useTimeUntilDispatchable](./useTimeUntilDispatchable.md) — when the batch becomes dispatchable
- [useBatchState](./useBatchState.md) — watch for `Finalized` after dispatch
- [VaultBatcher.dispatchBatch](../sdk/VaultBatcher.md#dispatchbatch) — imperative equivalent
