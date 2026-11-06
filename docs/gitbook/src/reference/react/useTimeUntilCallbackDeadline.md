---
title: useTimeUntilCallbackDeadline
description: Query hook for the seconds until a dispatched vault batch reaches its callback deadline.
---

# useTimeUntilCallbackDeadline

Reads how many seconds remain until a dispatched batch reaches its callback deadline. Same read as [`VaultBatcher.timeUntilCallbackDeadline`](../sdk/VaultBatcher.md#timeuntilcallbackdeadline).

- A positive value is the countdown. Pass `refetchInterval` to keep it live.
- `0` means the deadline has passed. From then on [`useFinalize`](./useFinalize.md) cancels the batch instead of settling it.
- `null` means the batch is not `Dispatched`, so there is no deadline to wait for.

The value is measured against the chain's block timestamp, not the local clock.

## Import

```ts
import { useTimeUntilCallbackDeadline } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="Deadline.tsx" %}

```tsx
import { useTimeUntilCallbackDeadline } from "@zama-fhe/react-sdk/vaults";

function Deadline({ batchId }: { batchId: bigint }) {
  const { data: secondsLeft } = useTimeUntilCallbackDeadline(
    { address: "0xDepositBatcher", batchId },
    { refetchInterval: 15_000 },
  );

  if (secondsLeft === undefined) return <span>Loading…</span>;
  if (secondsLeft === null) return <span>Not awaiting finalization</span>;
  if (secondsLeft > 0n) return <span>Settles within {secondsLeft.toString()}s</span>;
  return <span>Deadline passed — finalizing now cancels the batch</span>;
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseTimeUntilCallbackDeadlineConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

### batchId

`bigint | undefined`

The batch to check. The query is disabled while `undefined`.

---

### chainId

`number | undefined`

Chain to read from, when it is not the connected one, for example on a vault page shown before the wallet connects. Needs a provider that can route reads, such as `WagmiProvider`. Part of the query key.

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseTimeUntilCallbackDeadlineOptions } from "@zama-fhe/react-sdk/vaults";
```

The `data` property is `bigint | null | undefined`: seconds remaining, `0n` once the deadline has passed, `null` when the batch is not `Dispatched`, `undefined` while loading or disabled.

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useFinalize](./useFinalize.md) — settles the batch, or cancels it past the deadline
- [useBatchState](./useBatchState.md) — why the value is `null`
- [VaultBatcher.timeUntilCallbackDeadline](../sdk/VaultBatcher.md#timeuntilcallbackdeadline)
