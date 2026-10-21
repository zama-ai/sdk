---
title: useQuit
description: Mutation hook that withdraws the caller's own deposit from a pending or canceled vault batch.
---

# useQuit

Mutation hook that returns the caller's own deposit from a batch to their confidential balance on the batcher's input token. Same call as [`VaultBatcher.quit`](../sdk/VaultBatcher.md#quit).

It is legal in two states: `Pending` (undo a join before dispatch) and `Canceled` (take the deposit back after a batch failed to finalize). It refunds the caller only — to refund someone else's deposit in a canceled batch, use [`useRecover`](./useRecover.md).

## Import

```ts
import { useQuit } from "@zama-fhe/react-sdk/vaults";
```

## Usage

{% tabs %}
{% tab title="QuitButton.tsx" %}

```tsx
import { useQuit } from "@zama-fhe/react-sdk/vaults";

function QuitButton({ batchId }: { batchId: bigint }) {
  const { mutate: quit, isPending } = useQuit({ address: "0xDepositBatcher" });

  return (
    <button onClick={() => quit({ batchId })} disabled={isPending}>
      {isPending ? "Withdrawing..." : "Withdraw deposit"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseQuitConfig } from "@zama-fhe/react-sdk/vaults";
```

### address

`Address`

The batcher contract address (deposit or redeem direction).

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

```ts
import { type QuitParams } from "@zama-fhe/sdk/vaults";
```

### batchId

`bigint`

The pending or canceled batch to withdraw the caller's own deposit from.

```ts
quit({ batchId });
```

## Return Type

`data` is `{ txHash: Hex; receipt: TransactionReceipt }`.

On success the hook invalidates the input token's balance cache and the batcher's batch reads.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useRecover](./useRecover.md) — refund another account's deposit in a canceled batch
- [useBatchState](./useBatchState.md) — check the batch is `Pending` or `Canceled` first
- [VaultBatcher.quit](../sdk/VaultBatcher.md#quit) — imperative equivalent
