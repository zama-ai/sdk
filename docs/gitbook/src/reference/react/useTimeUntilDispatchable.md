---
title: useTimeUntilDispatchable
description: Query hook for the seconds until a vault batch becomes eligible for dispatch.
---

# useTimeUntilDispatchable

Reads how many seconds remain until a batch can be dispatched. Same read as [`VaultBatcher.timeUntilDispatchable`](../sdk/VaultBatcher.md#timeuntildispatchable).

- A positive value is the countdown. Pass `refetchInterval` to keep it live.
- `0` means the batch is old enough now — the earliest moment dispatch is possible, not a guarantee anyone will dispatch then.
- `null` means the batch has left `Pending` and can never be dispatched again, so `0` never has to stand in for "already dispatched".

The value is measured against the chain's block timestamp and the batch's own pinned minimum age, so neither local clock drift nor a policy change on the batcher desyncs the countdown.

## Import

```ts
import { useTimeUntilDispatchable } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="Countdown.tsx" %}

```tsx
import { useDispatchBatch, useTimeUntilDispatchable } from "@zama-fhe/react-sdk/vaults";

function Countdown({ batchId }: { batchId: bigint }) {
  const { data: secondsLeft } = useTimeUntilDispatchable(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 5_000 },
  );
  const dispatchBatch = useDispatchBatch({ address: "0xDepositBatcher" });

  if (secondsLeft === undefined) return <span>Loading…</span>;
  if (secondsLeft === null) return <span>Already dispatched</span>;
  if (secondsLeft > 0n) return <span>Dispatchable in {secondsLeft.toString()}s</span>;
  return <button onClick={() => dispatchBatch.mutate()}>Dispatch now</button>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseTimeUntilDispatchableConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### batchId

`bigint | undefined`

The batch to check. The query is disabled while `undefined`.

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseTimeUntilDispatchableOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `bigint | null | undefined`: seconds remaining, `0n` once dispatchable, `null` once the batch can no longer be dispatched, `undefined` while loading or disabled.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useDispatchBatch](./useDispatchBatch.md) — dispatch once this reads `0`
- [useBatchState](./useBatchState.md) — why the value went `null`
- [VaultBatcher.timeUntilDispatchable](../sdk/VaultBatcher.md#timeuntildispatchable)
